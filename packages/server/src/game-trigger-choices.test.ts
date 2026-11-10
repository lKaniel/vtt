import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sceneOf } from './actions/scene-actions.ts';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';

// More of Monk's Active Tiles at work: turning tiles and light beams,
// showing a player another scene, tiles only a creature close by can use,
// and dialogs whose buttons run different actions. The hero (Ana's) stands
// in the middle of the test room (150, 150).

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeTwoScenes());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.sent = [];
  return ws;
}

/** A lever at `x`, `y` (a 100 px square), with `trigger`. */
function lever(trigger: Record<string, unknown>, x = 0, y = 0): void {
  const doc = { id: 'lever', type: 'tile', rev: 0, kind: 'image', x, y, w: 100, h: 100, src: '/l.png', trigger };
  store.applyOps([{ op: 'create', coll: 'main/tiles', doc: doc }]);
}

const pull = (ws: FakeSocket, token?: string) => ws.receive({ t: 'trigger', tile: 'lever', ...(token && { token }) });
const errors = (ws: FakeSocket) => ws.take('error').map((e) => e.message);
const tileDoc = (id: string) => store.docs.get('main/tiles', id)!;

describe('trigger actions', () => {
  it('turns a tile to an angle or by some degrees, and a light beam too', () => {
    const wheel = { id: 'wheel', type: 'tile', rev: 0, kind: 'image', x: 200, y: 0, w: 100, h: 100, src: '/w.png' };
    const lamp = { id: 'beam', type: 'light', rev: 0, x: 150, y: 150, bright: 20, dim: 40, angle: 60 };
    store.applyOps([
      { op: 'create', coll: 'main/tiles', doc: wheel },
      { op: 'create', coll: 'main/lights', doc: lamp },
    ]);
    lever({
      actions: [
        { type: 'rotate', target: { coll: 'tiles', id: 'wheel' }, by: 45 },
        { type: 'rotate', target: { coll: 'lights', id: 'beam' }, to: 90 },
      ],
    });
    const ana = seat('ana');
    pull(ana);
    pull(ana);
    expect(tileDoc('wheel').rotation).toBe(90);
    expect(store.docs.get('main/lights', 'beam')!.rotation).toBe(90);
  });

  it('shows the player who clicked another scene, or everyone, without moving a creature', () => {
    lever({ actions: [{ type: 'view', scene: 'cellar' }] });
    const ana = seat('ana');
    pull(ana, 'hero');
    expect(sceneOf(game.findPlayer('ana')!, store)).toBe('cellar');
    expect(sceneOf(game.findPlayer('bo')!, store)).toBe('main');
    expect(store.tokens.get('hero')).toMatchObject({ x: 150, y: 150 });

    const everyone = { actions: [{ type: 'view', scene: 'cellar', everyone: true }] };
    store.applyOps([{ op: 'update', coll: 'main/tiles', id: 'lever', patch: { trigger: everyone } }]);
    seat('bo').receive({ t: 'trigger', tile: 'lever' });
    expect(['gm', 'ana', 'bo'].map((p) => sceneOf(game.findPlayer(p)!, store))).toEqual(['cellar', 'cellar', 'cellar']);
  });
});

describe('a tile only a creature close by can use', () => {
  it('refuses a click from a creature too far away, and works for one near it', () => {
    lever({ near: 50, actions: [{ type: 'message', text: 'Creak.' }] }, 300, 0);
    const ana = seat('ana');
    pull(ana, 'hero');
    expect(errors(ana)).toEqual(['Hero is too far away to use that']);
    store.setToken({ ...store.tokens.get('hero')!, x: 260, y: 50 });
    pull(ana, 'hero');
    expect(errors(ana)).toEqual([]);
  });

  it('takes the nearest creature of yours when you click with none, and lets the GM click from anywhere', () => {
    lever({ near: 50, actions: [{ type: 'message', text: 'Creak.' }] }, 300, 0);
    const ana = seat('ana');
    pull(ana);
    expect(errors(ana)).toEqual(['Hero is too far away to use that']);
    const gm = seat('gm');
    pull(gm);
    expect(errors(gm)).toEqual([]);
  });
});

describe('a dialog with buttons', () => {
  const choice = {
    type: 'choice',
    title: 'The well',
    text: 'Climb down the rope?',
    options: [
      { label: 'Yes', actions: [{ type: 'teleport', to: [50, 250] }] },
      { label: 'No', actions: [{ type: 'message', text: 'You step back.' }] },
    ],
  };

  it('asks the player who clicked, and runs what their answer says', () => {
    lever({ actions: [choice, { type: 'message', text: 'never' }] });
    const ana = seat('ana');
    pull(ana, 'hero');
    const [asked] = ana.take('triggerChoice');
    expect(asked).toMatchObject({ title: 'The well', text: 'Climb down the rope?', options: ['Yes', 'No'] });
    ana.receive({ t: 'triggerChoice', id: asked!.id, option: 0 });
    expect(store.tokens.get('hero')).toMatchObject({ x: 50, y: 250 });
  });

  it('takes one answer, from the one asked', () => {
    lever({ actions: [choice] });
    const ana = seat('ana');
    const bo = seat('bo');
    pull(ana, 'hero');
    const [asked] = ana.take('triggerChoice');
    expect(bo.take('triggerChoice')).toEqual([]);
    bo.receive({ t: 'triggerChoice', id: asked!.id, option: 0 });
    expect(errors(bo)).toEqual(['That choice is not yours']);
    ana.receive({ t: 'triggerChoice', id: asked!.id, option: 1 });
    ana.receive({ t: 'triggerChoice', id: asked!.id, option: 0 });
    expect(errors(ana)).toEqual(['That choice is not yours']);
    expect(store.tokens.get('hero')).toMatchObject({ x: 150, y: 150 });
  });
});

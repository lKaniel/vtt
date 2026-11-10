import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

let store: GameStore;
let game: Game;
let dice: number[];

const d20 = (face: number) => (face - 1) / 20 + 0.001;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      x: 650,
      y: 150,
      stats: { class: 'fighter', level: 5, maxHp: 50, abilities: { str: 18 }, skills: ['athletics'] },
    }),
  );
  store.setToken(TokenSchema.parse({ ...store.tokens.get('goblin'), x: 550, y: 150, monster: 'goblin' }));
});

afterEach(async () => {
  await store.flush();
});

function join_(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.take('welcome');
  return ws;
}

const goblin = () => store.tokens.get('goblin')!;
const hero = () => store.tokens.get('hero')!;
const grappled = () => (goblin().effects ?? []).some((e) => e.conditions?.includes('grappled'));

/** A fight where the hero goes first and has grappled the goblin. */
function grapple(): { gm: FakeSocket; ana: FakeSocket } {
  const gm = join_('gm');
  const ana = join_('ana');
  dice = [d20(20), d20(2)];
  gm.receive({ t: 'combatStart', tokens: ['hero', 'goblin'] });
  dice = [d20(15), d20(5)];
  ana.receive({ t: 'feature', token: 'hero', feature: 'grapple', targets: ['goblin'] });
  expect(grappled()).toBe(true);
  return { gm, ana };
}

describe('Escaping a grapple', () => {
  it('only a grappled creature has the Escape action', () => {
    const { gm } = grapple();
    gm.receive({ t: 'feature', token: 'hero', feature: 'escape' });
    expect(gm.take('error')[0]?.message).toMatch(/doesn't have that feature/);
  });

  it('frees the creature that wins the contest, using its action', () => {
    const { gm, ana } = grapple();
    ana.receive({ t: 'endTurn' });
    // The goblin's Acrobatics against the hero's Athletics.
    dice = [d20(19), d20(2)];
    gm.receive({ t: 'feature', token: 'goblin', feature: 'escape' });
    expect(gm.take('chat').some((m) => JSON.stringify(m).includes('Goblin escapes from Hero'))).toBe(true);
    expect(grappled()).toBe(false);
    expect(store.combat!.left.action).toBe(false);
  });

  it('leaves it grappled when it loses', () => {
    const { gm, ana } = grapple();
    ana.receive({ t: 'endTurn' });
    dice = [d20(2), d20(19)];
    gm.receive({ t: 'feature', token: 'goblin', feature: 'escape' });
    expect(grappled()).toBe(true);
    expect(store.combat!.left.action).toBe(false);
  });

  it("a monster's grapple sets its escape DC", () => {
    const { gm, ana } = grapple();
    const effects = goblin().effects!.map((e) => (e.conditions?.includes('grappled') ? { ...e, escape: 30 } : e));
    store.setToken({ ...goblin(), effects });
    ana.receive({ t: 'endTurn' });
    dice = [d20(20)];
    gm.receive({ t: 'feature', token: 'goblin', feature: 'escape' });
    expect(grappled()).toBe(true);
  });
});

describe('Dragging a grappled creature', () => {
  it('pulls the grappled creature along behind, at double the movement cost', () => {
    const { ana } = grapple();
    ana.receive({ t: 'move', token: 'hero', to: [850, 150] });
    expect(ana.take('error')).toEqual([]);
    expect([hero().x, goblin().x]).toEqual([850, 750]);
    expect(store.combat!.left.move).toBe(30 - 20);
    expect(grappled()).toBe(true);
  });

  it("can't drag farther than half its speed", () => {
    const { ana } = grapple();
    ana.receive({ t: 'move', token: 'hero', to: [1050, 150] });
    expect(ana.take('error')[0]?.message).toMatch(/movement left/);
    expect(goblin().x).toBe(550);
  });

  it('drags a much smaller creature at no extra cost', () => {
    const { ana } = grapple();
    store.setToken({ ...hero(), size: 3 });
    ana.receive({ t: 'move', token: 'hero', to: [950, 150] });
    expect(ana.take('error')).toEqual([]);
    expect(store.combat!.left.move).toBe(30 - 15);
  });
});

import type { Doc } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { FakeSocket, makeCombined } from './test/fixtures.ts';

// What a part brings to a combined scene besides its map: its regions and
// tile triggers work on the whole, and players there are sent its notes,
// sounds, drawings and shown regions. "main" (the 300 px room with a door
// east) lies on "city" at 4000, 0; Ana's ranger stands in the room there.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeCombined());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
  const ranger = { id: 'ranger', type: 'token', rev: 0, name: 'Ranger', x: 4150, y: 150, ownership: { ana: 'owner' } };
  store.applyOps([{ op: 'create', coll: 'city/tokens', doc: ranger }]);
  seat('gm').receive({ t: 'activateScene', scene: 'city' });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

const create = (coll: string, doc: Record<string, unknown>) =>
  store.applyOps([{ op: 'create', coll, doc: { rev: 0, ...doc } as Doc }]);

const EAST = [
  [200, 100],
  [300, 100],
  [300, 200],
  [200, 200],
];

/** A region of "main" over the square east of the room's middle. */
const region = (behaviors: unknown[], extra: Record<string, unknown> = {}) =>
  create('main/regions', { id: 'spot', type: 'region', points: EAST, behaviors, ...extra });

const stepEast = (ws: FakeSocket) => ws.receive({ t: 'move', token: 'ranger', to: [4250, 150] });
const ranger = () => store.inScene('city', () => store.tokens.get('ranger')!);
const door = () => store.docs.get('main/walls', 'door')!.door;

describe('a region of a part, on the combined scene', () => {
  it('works where the part lies, on the things of its part', () => {
    region([{ type: 'door', wall: 'door', to: 'open' }]);
    stepEast(seat('ana'));
    expect(ranger()).toMatchObject({ x: 4250, y: 150 });
    expect(door()).toBe('open');
  });

  it('teleports to a place of its part, on the whole scene', () => {
    region([{ type: 'teleport', to: [50, 50] }]);
    stepEast(seat('ana'));
    expect(ranger()).toMatchObject({ x: 4050, y: 50 });
  });

  it('keeps a creature in the city when it teleports to another part', () => {
    region([{ type: 'teleport', to: [150, 150], scene: 'cellar' }]);
    stepEast(seat('ana'));
    expect(ranger()).toMatchObject({ x: 150, y: 4150 });
    expect(store.docs.get('cellar/tokens', 'ranger')).toBeUndefined();
  });

  it('saves a trap sprung once in its part', () => {
    region([{ type: 'trap', once: true, message: 'Click.' }]);
    const ana = seat('ana');
    stepEast(ana);
    expect(store.docs.get('main/regions', 'spot')).toMatchObject({ disabled: true });
    expect(ana.take('chat').map((c) => c.message.text)).toEqual(['Click.']);
  });
});

describe('a trigger tile of a part, on the combined scene', () => {
  const lever = (trigger: Record<string, unknown>) =>
    create('main/tiles', {
      id: 'lever',
      type: 'tile',
      kind: 'image',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      src: '/assets/up.png',
      trigger,
    });

  it('is clicked under its name there and changes its part', () => {
    lever({
      actions: [
        { type: 'image', images: ['/assets/up.png', '/assets/down.png'] },
        { type: 'door', wall: 'door', to: 'toggle' },
      ],
    });
    const ana = seat('ana');
    ana.receive({ t: 'trigger', tile: 'main--lever', token: 'ranger' });
    expect(ana.take('error')).toEqual([]);
    expect(store.docs.get('main/tiles', 'lever')).toMatchObject({ src: '/assets/down.png', x: 0 });
    expect(door()).toBe('open');
  });

  it('runs when a creature walks onto it there, once when it says so', () => {
    create('main/tiles', {
      id: 'plate',
      type: 'tile',
      kind: 'image',
      x: 200,
      y: 100,
      w: 100,
      h: 100,
      src: '/assets/plate.png',
      trigger: { on: 'enter', once: true, actions: [{ type: 'door', wall: 'door', to: 'open' }] },
    });
    stepEast(seat('ana'));
    expect(door()).toBe('open');
    expect(store.docs.get('main/tiles', 'plate')).toMatchObject({ trigger: { disabled: true } });
  });
});

describe('players on a combined scene', () => {
  const pin = { id: 'pin', type: 'note', x: 100, y: 100, label: 'Inn' };
  const docsOf = (ws: FakeSocket) => ws.take('welcome').at(-1)!.docs ?? {};

  it('are sent the notes, sounds, drawings and shown regions of its parts', () => {
    create('main/notes', pin);
    create('main/notes', { ...pin, id: 'secret', hidden: true });
    create('main/sounds', { id: 'fire', type: 'sound', x: 100, y: 100, radius: 30, src: '/assets/fire.ogg' });
    region([{ type: 'difficult' }], { visible: true });
    const docs = docsOf(seat('ana'));
    expect(docs['main/notes']?.map((d) => d.id)).toEqual(['pin']);
    expect(docs['main/sounds']?.map((d) => d.id)).toEqual(['fire']);
    expect(docs['main/regions']?.map((d) => d.id)).toEqual(['spot']);
  });

  it('are not sent those of a scene that is no part of theirs', () => {
    const scene = store.docs.get('scenes', 'city')!;
    const parts = [{ scene: 'cellar', x: 0, y: 4000 }];
    store.applyOps([{ op: 'update', coll: 'scenes', id: 'city', rev: scene.rev, patch: { parts } }]);
    create('main/notes', pin);
    expect(docsOf(seat('ana'))['main/notes']).toBeUndefined();
  });
});

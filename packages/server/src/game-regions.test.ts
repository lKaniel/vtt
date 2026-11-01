import type { Doc } from '@vtt/core';
import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';

// Regions at work: walking into one runs its behaviours. The hero stands in
// the middle of the test room (150, 150); the region covers the square east
// of them, so a step east enters it.

let store: GameStore;
let game: Game;
let dice: number[];

beforeEach(async () => {
  store = new GameStore(await makeTwoScenes());
  await store.load();
  dice = [];
  game = new Game(store, { rng: () => dice.shift() ?? 0.5 });
  store.setToken(
    TokenSchema.parse({
      ...store.tokens.get('hero'),
      stats: { level: 1, maxHp: 12, abilities: { dex: 10 } },
    }),
  );
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

const EAST = [
  [200, 100],
  [300, 100],
  [300, 200],
  [200, 200],
];

function region(behaviors: unknown[], extra: Record<string, unknown> = {}): void {
  const doc = { id: 'spot', type: 'region', rev: 0, points: EAST, behaviors, ...extra } as Doc;
  store.applyOps([{ op: 'create', coll: 'main/regions', doc }]);
}

const stepEast = (ws: FakeSocket) => ws.receive({ t: 'move', token: 'hero', to: [250, 150] });
const texts = (ws: FakeSocket) => ws.take('chat').map((c) => c.message.text);

describe('regions', () => {
  it('spring a trap on a creature that walks in: a save, then damage', () => {
    region([
      { type: 'trap', message: 'Spikes shoot up!', system: { save: 'dex', dc: 15, damage: '1d6', type: 'piercing' } },
    ]);
    const ana = seat('ana');
    dice = [0, 0.99];
    stepEast(ana);
    expect(store.tokens.get('hero')).toMatchObject({ x: 250, hp: 6 });
    expect(texts(ana)).toEqual(['Spikes shoot up! Hero: DEX save 1 vs DC 15: failed, 6 piercing damage']);
  });

  it('spring a trap meant once only once, and undo with the move', () => {
    region([{ type: 'trap', once: true, system: { damage: '2', type: 'fire' } }]);
    const ana = seat('ana');
    stepEast(ana);
    expect(store.docs.get('main/regions', 'spot')!.disabled).toBe(true);
    const gm = seat('gm');
    gm.receive({ t: 'undo' });
    expect(store.tokens.get('hero')).toMatchObject({ x: 150 });
    expect(store.tokens.get('hero')!.hp).toBeUndefined();
    expect(store.docs.get('main/regions', 'spot')!.disabled).toBeUndefined();
  });

  it('do nothing while turned off', () => {
    region([{ type: 'message', text: 'Boo' }], { disabled: true });
    const ana = seat('ana');
    stepEast(ana);
    expect(texts(ana)).toEqual([]);
  });

  it('teleport a token on the same scene', () => {
    region([{ type: 'teleport', to: [50, 250] }]);
    stepEast(seat('ana'));
    expect(store.tokens.get('hero')).toMatchObject({ x: 50, y: 250 });
  });

  it('teleport a token to another scene, and the players who own it with it', () => {
    region([{ type: 'teleport', to: [350, 350], scene: 'cellar' }]);
    stepEast(seat('ana'));
    expect(store.tokens.get('hero')).toBeUndefined();
    expect(store.inScene('cellar', () => store.tokens.get('hero'))).toMatchObject({ x: 350, y: 350 });
    expect(store.world.players.find((p) => p.id === 'ana')).toMatchObject({ scene: 'cellar' });
  });

  it('take a token to another level', () => {
    const scene = store.docs.get('scenes', 'main')!;
    const levels = [
      { id: 'ground', name: 'Ground', bottom: 0 },
      { id: 'loft', name: 'Loft', bottom: 10 },
    ];
    store.applyOps([{ op: 'update', coll: 'scenes', id: scene.id, patch: { levels } }]);
    region([{ type: 'level', to: 'loft' }]);
    stepEast(seat('ana'));
    expect(store.tokens.get('hero')).toMatchObject({ elevation: 10 });
  });

  it('say something in chat, to everyone or to the GM alone', () => {
    region([
      { type: 'message', text: 'The floor creaks.' },
      { type: 'message', text: 'Ana found the hidden lever', gmOnly: true },
    ]);
    const gm = seat('gm');
    const bo = seat('bo');
    stepEast(seat('ana'));
    expect(texts(gm)).toEqual(['The floor creaks.', 'Ana found the hidden lever']);
    expect(texts(bo)).toEqual(['The floor creaks.']);
  });

  it('reveal the whole region to the players whose token entered it', () => {
    // A strip from the square east of the hero out through the wall, far beyond what the hero sees.
    const strip = [
      [200, 100],
      [2000, 100],
      [2000, 200],
      [200, 200],
    ];
    region([{ type: 'reveal' }], { points: strip });
    const ana = seat('ana');
    expect(store.fog.map('main', 'ana', 25).explored([1500, 150])).toBe(false);
    stepEast(ana);
    expect(store.fog.map('main', 'ana', 25).explored([1500, 150])).toBe(true);
    expect(store.fog.map('main', 'bo', 25).explored([1500, 150])).toBe(false);
  });

  it('cost twice the movement on difficult ground', () => {
    region([{ type: 'difficult' }]);
    const gm = seat('gm');
    gm.receive({ t: 'combatStart', tokens: ['hero'] });
    stepEast(seat('ana'));
    expect(store.combat!.left.move).toBe(20);
  });
});

import type { Doc } from '@vtt/core';
import { TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
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

  describe('between levels', () => {
    const levels = [
      { id: 'cellar', name: 'Cellar', bottom: -10 },
      { id: 'ground', name: 'Ground', bottom: 0 },
      { id: 'loft', name: 'Loft', bottom: 10 },
    ];
    beforeEach(() => {
      store.applyOps([{ op: 'update', coll: 'scenes', id: 'main', patch: { levels } }]);
    });
    const stepBack = (ws: FakeSocket) => ws.receive({ t: 'move', token: 'hero', to: [150, 150] });

    it('climb stairs up, and down again the next time', () => {
      region([{ type: 'stairs', between: ['ground', 'loft'] }], { levels: ['ground', 'loft'] });
      const ana = seat('ana');
      stepEast(ana);
      expect(store.tokens.get('hero')).toMatchObject({ elevation: 10 });
      stepBack(ana);
      stepEast(ana);
      expect(store.tokens.get('hero')!.elevation ?? 0).toBe(0);
    });

    it("do nothing for a creature on another level than the region's", () => {
      region([{ type: 'message', text: 'Creak' }], { level: 'loft' });
      const ana = seat('ana');
      stepEast(ana);
      expect(texts(ana)).toEqual([]);
    });

    const wallDoc = (id: string, extra: Record<string, unknown>) =>
      ({ id, type: 'wall', rev: 0, a: [200, 0], b: [200, 300], ...extra }) as Doc;
    const across = (points: number[][], behaviors: unknown[], extra: Record<string, unknown> = {}) => {
      const doc = { id: 'across', type: 'region', rev: 0, points, behaviors, ...extra } as Doc;
      store.applyOps([{ op: 'create', coll: 'main/regions', doc }]);
    };
    // A strip the walk from (150, 150) to (250, 150) crosses, and leaves.
    const STRIP = [
      [180, 100],
      [220, 100],
      [220, 200],
      [180, 200],
    ];

    it('walk past the walls of other floors, and stop at those of their own', () => {
      store.applyOps([{ op: 'create', coll: 'main/walls', doc: wallDoc('loft-wall', { level: 'loft' }) }]);
      const ana = seat('ana');
      stepEast(ana);
      expect(store.tokens.get('hero')).toMatchObject({ x: 250, y: 150 });
      stepBack(ana);
      store.setToken({ ...store.tokens.get('hero')!, elevation: 10 });
      stepEast(ana);
      expect(store.tokens.get('hero')).toMatchObject({ x: 150, y: 150 });
      expect(ana.take('error')).toHaveLength(1);
    });

    it('walk under a creature on another floor', () => {
      store.setToken({ ...store.tokens.get('goblin')!, x: 250, y: 150, elevation: 10 });
      stepEast(seat('ana'));
      expect(store.tokens.get('hero')).toMatchObject({ x: 250, y: 150 });
    });

    it('take stairs only where the walk ends, not on the way past them', () => {
      across(STRIP, [{ type: 'stairs', between: ['ground', 'loft'] }]);
      stepEast(seat('ana'));
      expect(store.tokens.get('hero')!.elevation ?? 0).toBe(0);
    });

    it('fall through a hole to the floor below, stopping where they stepped in', () => {
      across(STRIP, [{ type: 'fall' }], { level: 'loft' });
      store.setToken({ ...store.tokens.get('hero')!, elevation: 10 });
      stepEast(seat('ana'));
      const hero = store.tokens.get('hero')!;
      expect(hero.elevation ?? 0).toBe(0);
      expect(hero.x).toBeGreaterThan(180);
      expect(hero.x).toBeLessThanOrEqual(220);
    });

    it('hurt a creature for the drop when the hole says so', () => {
      across(STRIP, [{ type: 'fall', damage: true }], { level: 'loft' });
      store.setToken({ ...store.tokens.get('hero')!, elevation: 10 });
      const ana = seat('ana');
      stepEast(ana);
      expect(store.tokens.get('hero')!.hp).toBeLessThan(12);
      expect(texts(ana).join(' ')).toMatch(/falls 10 ft/);
    });

    it('teleport onto another floor', () => {
      region([{ type: 'teleport', to: [100, 100], level: 'loft' }]);
      stepEast(seat('ana'));
      expect(store.tokens.get('hero')).toMatchObject({ x: 100, y: 100, elevation: 10 });
    });

    it('ask the owner which floor an elevator goes to, then take them there', () => {
      region([{ type: 'elevator', floors: ['cellar', 'ground', 'loft'] }]);
      const ana = seat('ana');
      const gm = seat('gm');
      stepEast(ana);
      expect(ana.take('levelChoice')).toEqual([{ t: 'levelChoice', token: 'hero', levels: ['cellar', 'loft'] }]);
      expect(gm.take('levelChoice')).toEqual([]);
      ana.receive({ t: 'changeLevel', token: 'hero', level: 'cellar' });
      expect(store.tokens.get('hero')).toMatchObject({ elevation: -10 });
    });

    it('refuse a floor change away from an elevator, except for the GM', () => {
      const ana = seat('ana');
      ana.receive({ t: 'changeLevel', token: 'hero', level: 'loft' });
      expect(store.tokens.get('hero')!.elevation ?? 0).toBe(0);
      expect(ana.take('error')).toHaveLength(1);
      seat('gm').receive({ t: 'changeLevel', token: 'hero', level: 'loft' });
      expect(store.tokens.get('hero')).toMatchObject({ elevation: 10 });
    });
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
    // 5 ft walked, the second half of it (2.5 ft) on difficult ground.
    stepEast(seat('ana'));
    expect(store.combat!.left.move).toBe(22);
  });
});

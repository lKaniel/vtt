import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';
import { GameStore } from './store/game-store.ts';

// The GM's `build`: map documents and new creatures for any scene, as one
// undo step (what Claude's build_scene tool sends).

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
  ws.take('welcome');
  return ws;
}

const wall = { op: 'create', coll: 'cellar/walls', doc: { type: 'wall', id: 'w2', rev: 0, a: [0, 0], b: [500, 0] } };
const goblin = { from: { kind: 'monster', id: 'goblin', rules: '2014' }, at: [720, 480], hidden: true };

describe('building a scene', () => {
  it('adds map items and creatures to a scene the GM is not on, as one undo step', () => {
    const gm = seat('gm');
    gm.receive({ t: 'build', scene: 'cellar', label: 'Claude: cellar', ops: [wall], spawns: [goblin, goblin] });
    expect(store.docs.get('cellar/walls', 'w2')).toBeDefined();
    const made = store.inScene('cellar', () => [...store.tokens.values()].filter((t) => t.monster === 'goblin'));
    expect(made.map((t) => t.name)).toEqual(['Goblin', 'Goblin 2']);
    expect(made[0]).toMatchObject({ hidden: true, x: 750, y: 450 });
    expect([...store.tokens.keys()].sort((a, b) => a.localeCompare(b))).toEqual(['goblin', 'hero']);

    gm.receive({ t: 'undo' });
    expect(store.docs.get('cellar/walls', 'w2')).toBeUndefined();
    expect(store.inScene('cellar', () => [...store.tokens.values()].some((t) => t.monster === 'goblin'))).toBe(false);
  });

  it('is the GM’s alone', () => {
    const ana = seat('ana');
    ana.receive({ t: 'build', scene: 'cellar', ops: [wall], spawns: [] });
    expect(ana.take('error').map((e) => e.message)).toEqual([expect.stringMatching(/GM/)]);
    expect(store.docs.get('cellar/walls', 'w2')).toBeUndefined();
  });

  it('refuses all of it when an op is bad, or the scene is unknown', () => {
    const gm = seat('gm');
    const bad = { op: 'create', coll: 'cellar/walls', doc: { type: 'wall', id: 'w3', rev: 0, a: [0, 0] } };
    gm.receive({ t: 'build', scene: 'cellar', ops: [wall, bad], spawns: [goblin] });
    expect(gm.take('error')).toHaveLength(1);
    expect(store.docs.get('cellar/walls', 'w2')).toBeUndefined();
    expect(store.inScene('cellar', () => store.tokens.size)).toBe(2);
    gm.receive({ t: 'build', scene: 'attic', ops: [wall], spawns: [] });
    expect(gm.take('error').map((e) => e.message)).toEqual(['No scene "attic"']);
  });
});

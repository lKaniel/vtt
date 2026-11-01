import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ActorSchema, type Chunk, type Token } from '@vtt/shared';
import { describe, expect, it, vi } from 'vitest';
import { GameStore } from './game-store.ts';
import { makeLegacyWorld, makeWorld } from './test/fixtures.ts';

async function loaded(dir?: string): Promise<{ dir: string; store: GameStore }> {
  dir ??= await makeWorld();
  const store = new GameStore(dir);
  await store.load();
  return { dir, store };
}

const readJson = async (dir: string, rel: string): Promise<unknown> =>
  JSON.parse(await readFile(join(dir, rel), 'utf8'));

/** The first argument of the next `event`. */
function next(store: GameStore, event: 'token' | 'tokenGone' | 'chunk' | 'actorGone' | 'lighting'): Promise<unknown> {
  const on = store.once.bind(store) as (event: string, fn: (first: unknown) => void) => unknown;
  return new Promise((resolve) => on(event, resolve));
}

/** Runs `fn` with the store watching its folder. */
async function watching(store: GameStore, fn: () => Promise<void>): Promise<void> {
  store.watch();
  try {
    await fn();
  } finally {
    store.close();
  }
}

describe('GameStore', () => {
  it('loads every file and finds walls and lights near a point', async () => {
    const { store } = await loaded();
    expect(store.world).toMatchObject({ name: 'Test', darkness: 1, gridSize: 100, chunkSize: 2000 });
    expect(store.tokens.size).toBe(2);
    expect(store.wallsBetween([150, 150], [550, 150]).map((w) => w.id)).toContain('door');
    expect(store.lights().map((l) => [l.x, l.y])).toEqual([[550, 150]]);
    expect([...store.chunks.keys()]).toEqual(['0_0']);
  });

  it('keeps every document with a revision that each change bumps', async () => {
    const { store } = await loaded();
    expect(store.docs.get('main/tokens', 'hero')).toMatchObject({ type: 'token', rev: 1 });
    store.setToken({ ...store.tokens.get('hero')!, x: 50 });
    expect(store.docs.get('main/tokens', 'hero')).toMatchObject({ x: 50, rev: 2 });
    expect(store.tokens.get('hero')).not.toHaveProperty('rev');
  });

  it('writes changes back to the scene files', async () => {
    const { dir, store } = await loaded();
    store.setToken({ ...store.tokens.get('hero')!, x: 50 });
    await store.flush();
    const tokens = (await readJson(dir, 'scenes/main/tokens.json')) as Token[];
    expect(tokens.map((t) => [t.id, t.x])).toEqual([
      ['hero', 50],
      ['goblin', 550],
    ]);
    expect(tokens[0]).not.toHaveProperty('type');
  });

  it('writes game.json when the seats change', async () => {
    const { dir, store } = await loaded();
    const players = store.world.players.map((p) => (p.id === 'bo' ? { ...p, role: 'observer' as const } : p));
    store.setWorld({ ...store.world, players });
    await store.flush();
    const saved = (await readJson(dir, 'game.json')) as { id: string; players: { role: string }[] };
    expect(saved.id).toBe('test');
    expect(saved.players.map((p) => p.role)).toEqual(['gm', 'player', 'observer']);
  });

  it('deletes a removed token from its scene', async () => {
    const { dir, store } = await loaded();
    const gone = next(store, 'tokenGone');
    store.removeToken('goblin');
    expect(await gone).toBe('goblin');
    await store.flush();
    expect(((await readJson(dir, 'scenes/main/tokens.json')) as Token[]).map((t) => t.id)).toEqual(['hero']);
  });

  it('picks up edits made outside the game and ignores broken ones', async () => {
    const { dir, store } = await loaded();
    await watching(store, async () => {
      const changed = next(store, 'token');
      const tokens = (await readJson(dir, 'scenes/main/tokens.json')) as Token[];
      await writeFile(
        join(dir, 'scenes/main/tokens.json'),
        JSON.stringify(tokens.map((t) => (t.id === 'goblin' ? { ...t, x: 950 } : t))),
      );
      expect(await changed).toMatchObject({ id: 'goblin', x: 950 });
      expect(store.docs.get('main/tokens', 'hero')!.rev).toBe(1);
      await writeFile(join(dir, 'scenes/main/tokens.json'), '{ broken');
      await new Promise((r) => setTimeout(r, 300));
      expect(store.tokens.get('goblin')!.x).toBe(950);
    });
  });

  it('changes the time of day without starting the game over', async () => {
    const { dir, store } = await loaded();
    const events: string[] = [];
    store.on('lighting', () => events.push('lighting'));
    store.on('world', () => events.push('world'));
    store.setDarkness(0.7);
    await store.flush();
    expect(await readJson(dir, 'scenes/main/scene.json')).toEqual({
      gridSize: 100,
      chunkSize: 2000,
      start: [0, 0],
      darkness: 0.7,
      vision: true,
    });
    await watching(store, async () => {
      const lit = next(store, 'lighting');
      await writeFile(join(dir, 'scenes/main/scene.json'), JSON.stringify({ darkness: 0.2 }));
      await lit;
      expect(events).toEqual(['lighting', 'lighting']);
    });
  });

  it('refuses to start without a valid game.json', async () => {
    const { dir } = await loaded();
    await writeFile(join(dir, 'game.json'), '{}');
    await expect(new GameStore(dir).load()).rejects.toThrow(/game.json is invalid/);
  });

  it('refuses to start when the active scene has no folder', async () => {
    const { dir } = await loaded();
    const game = (await readJson(dir, 'game.json')) as object;
    await writeFile(join(dir, 'game.json'), JSON.stringify({ ...game, scene: 'cellar' }));
    await expect(new GameStore(dir).load()).rejects.toThrow(/scene "cellar"/);
  });
});

describe('GameStore map', () => {
  it('saves a map edit that moves a light into another chunk', async () => {
    const { dir, store } = await loaded();
    const events: [string, Chunk][] = [];
    store.on('chunk', (key, chunk) => events.push([key, chunk]));
    const lamp = store.chunks.get('0_0')!.lights[0]!;
    store.setChunks([
      { key: '0_0', chunk: { ...store.chunks.get('0_0')!, lights: [] } },
      { key: '1_0', chunk: { tiles: [], walls: [], lights: [{ ...lamp, x: 2050 }] } },
    ]);
    expect(events.map(([key, c]) => [key, c.lights.length])).toEqual([
      ['0_0', 0],
      ['1_0', 1],
    ]);
    await store.flush();
    expect(await readJson(dir, 'scenes/main/lights.json')).toEqual([{ ...lamp, x: 2050 }]);
  });

  it('tells clients when a hand edit empties a chunk', async () => {
    const { dir, store } = await loaded();
    await watching(store, async () => {
      const gone = new Promise((resolve) => store.once('chunkGone', resolve));
      await writeFile(join(dir, 'scenes/main/walls.json'), '[]');
      await writeFile(join(dir, 'scenes/main/lights.json'), '[]');
      expect(await gone).toBe('0_0');
      expect(store.chunks.has('0_0')).toBe(false);
    });
  });

  it('opens a door edited by hand in its chunk only', async () => {
    const { dir, store } = await loaded();
    await watching(store, async () => {
      const changed = next(store, 'chunk');
      const walls = (await readJson(dir, 'scenes/main/walls.json')) as { id: string }[];
      const open = walls.map((w) => (w.id === 'door' ? { ...w, door: 'open' } : w));
      await writeFile(join(dir, 'scenes/main/walls.json'), JSON.stringify(open));
      expect(await changed).toBe('0_0');
      expect(store.chunks.get('0_0')!.walls.find((w) => w.id === 'door')!.door).toBe('open');
    });
  });
});

describe('GameStore tiles', () => {
  const tile = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    type: 'tile',
    rev: 0,
    kind: 'rect',
    color: '#888888',
    x: 100,
    y: 100,
    w: 100,
    h: 100,
    ...extra,
  });

  it('sends tiles in draw order with their place in it, and groups not at all', async () => {
    const { store } = await loaded();
    store.applyOps([
      { op: 'create', coll: 'main/tiles', doc: tile('top', { sort: 'Z' }) },
      { op: 'create', coll: 'main/tiles', doc: { id: 'camp', type: 'tile', rev: 0, kind: 'group', sort: 'B' } },
      { op: 'create', coll: 'main/tiles', doc: tile('tent', { parent: 'camp', x: 2100 }) },
      { op: 'create', coll: 'main/tiles', doc: tile('ground', { sort: 'A' }) },
    ]);
    const tiles = [...store.chunks.values()].flatMap((c) => c.tiles);
    expect(tiles.map((t) => [t.id, t.z]).sort((a, b) => (a[1] as number) - (b[1] as number))).toEqual([
      ['ground', 0],
      ['tent', 1],
      ['top', 2],
    ]);
  });

  it('resends every chunk with tiles when the draw order changes', async () => {
    const { store } = await loaded();
    store.applyOps([
      { op: 'create', coll: 'main/tiles', doc: tile('a', { sort: 'A' }) },
      { op: 'create', coll: 'main/tiles', doc: tile('b', { sort: 'B', x: 2100 }) },
    ]);
    const sent: string[] = [];
    store.on('chunk', (key) => sent.push(key));
    store.applyOps([{ op: 'update', coll: 'main/tiles', id: 'a', patch: { sort: 'C' } }]);
    expect(sent.toSorted((a, b) => a.localeCompare(b))).toEqual(['0_0', '1_0']);
    expect(store.chunks.get('1_0')!.tiles[0]!.z).toBe(0);
  });

  it('keeps the draw order out of the tiles a map edit saves', async () => {
    const { dir, store } = await loaded();
    store.applyOps([{ op: 'create', coll: 'main/tiles', doc: tile('a') }]);
    store.setChunk('0_0', store.chunks.get('0_0')!);
    await store.flush();
    expect(await readJson(dir, 'scenes/main/tiles.json')).toEqual([
      { id: 'a', kind: 'rect', color: '#888888', x: 100, y: 100, w: 100, h: 100 },
    ]);
  });
});

describe('GameStore actors and combat', () => {
  it('loads actors/ and writes and deletes actor files', async () => {
    const { dir, store } = await loaded();
    store.setActor(ActorSchema.parse({ id: 'bandit', name: 'Bandit', folder: 'Road' }));
    await store.flush();
    const again = new GameStore(dir);
    await again.load();
    expect(again.actors.get('bandit')).toMatchObject({ name: 'Bandit', folder: 'Road' });
    again.removeActor('bandit');
    await again.flush();
    await expect(readFile(join(dir, 'actors/bandit.json'), 'utf8')).rejects.toThrow();
  });

  it('drops an actor whose file was deleted by hand', async () => {
    const { dir, store } = await loaded();
    store.setActor(ActorSchema.parse({ id: 'bandit', name: 'Bandit' }));
    await store.flush();
    await watching(store, async () => {
      const gone = next(store, 'actorGone');
      await rm(join(dir, 'actors/bandit.json'));
      expect(await gone).toBe('bandit');
    });
  });

  it('writes the fight to combat.json and removes it when it ends', async () => {
    const { dir, store } = await loaded();
    const left = { move: 30, action: true, bonus: true, attacks: 0, used: [] };
    store.setCombat({ round: 2, turn: 0, order: [{ token: 'hero', initiative: 9 }], left, reacted: [], side: {} });
    await store.flush();
    expect(await readJson(dir, 'combat.json')).toMatchObject({ round: 2 });
    expect(await readJson(dir, 'combat.json')).not.toHaveProperty('id');
    store.setCombat(undefined);
    await store.flush();
    await expect(readFile(join(dir, 'combat.json'), 'utf8')).rejects.toThrow();
  });
});

describe('GameStore migration', () => {
  it('moves an old world folder to the new layout on load', async () => {
    const log = vi.spyOn(console, 'log').mockReturnValue();
    const { dir, store } = await loaded(await makeLegacyWorld());
    log.mockRestore();
    expect(store.world.name).toBe('Test');
    expect([...store.tokens.keys()].sort((a, b) => a.localeCompare(b))).toEqual(['goblin', 'hero']);
    expect(store.actors.has('bandit')).toBe(true);
    expect(store.combat?.order[0]?.token).toBe('hero');
    expect(await readJson(dir, 'game.json')).toMatchObject({ scene: 'main' });
  });
});

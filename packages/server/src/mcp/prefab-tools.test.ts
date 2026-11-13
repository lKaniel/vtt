import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../game.ts';
import { PackStore } from '../library/pack-store.ts';
import { GameStore } from '../store/game-store.ts';
import { makeTwoScenes } from '../test/fixtures.ts';
import { mcpTools } from './mcp-tools.ts';

// Claude placing whole prefabs of a pack (a Baileywiki house: its floor,
// roof, walls, door, window and lamp as one) over the bridge: finding them
// with what they hold, and putting them on a scene at its own square size.

let dir: string;
let store: GameStore;
let game: Game;

async function put(root: string, path: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), JSON.stringify(data));
}

const picture = (id: string, extra: object = {}) => ({
  id,
  kind: 'image',
  x: 3000,
  y: 1500,
  w: 600,
  h: 450,
  src: `pack://bw/media/${id}.webp`,
  ...extra,
});

/** A cottage made on 150 px squares: 4 x 3 squares, its top-left corner at (3000, 1500). */
const cottage = {
  id: 'cottage',
  name: 'Farmer Cottage',
  tags: ['town', 'house'],
  grid: 150,
  tiles: [picture('cottage-floor'), picture('cottage-roof', { overhead: true })],
  walls: [
    { id: 'north', a: [3000, 1500], b: [3600, 1500] },
    { id: 'door', a: [3000, 1650], b: [3000, 1800], door: 'closed' },
    { id: 'window', a: [3600, 1650], b: [3600, 1800], sight: 'none', light: 'none' },
  ],
  lights: [{ id: 'lamp', x: 3300, y: 1725, bright: 10, dim: 20 }],
};
const well = {
  id: 'well',
  name: 'Stone Well',
  tags: ['town'],
  grid: 150,
  tiles: [picture('well', { w: 150, h: 150 })],
};

const stub = ({ id, name, tags }: { id: string; name: string; tags: string[] }) => ({ id, name, tags });

beforeEach(async () => {
  dir = await makeTwoScenes();
  const packDir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
  const shelf = { id: 'houses', type: 'prefab', path: 'compendia/houses', split: true };
  await put(packDir, 'bw/pack.json', { id: 'bw', name: 'Baileywiki', compendia: [shelf] });
  await put(packDir, 'bw/compendia/houses/index.json', [stub(cottage), stub(well)]);
  await put(packDir, 'bw/compendia/houses/cottage.json', cottage);
  await put(packDir, 'bw/compendia/houses/well.json', well);
  const file = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as object;
  await put(dir, 'game.json', { ...file, packs: ['bw'] });
  const packs = new PackStore(packDir);
  await packs.load();
  store = new GameStore(dir, undefined, packs);
  await store.load();
  game = new Game(store, { rng: () => 0 });
});

afterEach(async () => {
  await store.flush();
});

function gm(): (name: string, args?: Record<string, unknown>) => Promise<string> {
  const tools = mcpTools({
    games: () => Promise.resolve([{ id: 'test', name: 'Test', role: 'gm' }]),
    seat: () => Promise.resolve({ game, player: game.findPlayer('gm')! }),
    guide: () => Promise.resolve('# Game format'),
  });
  return async (name, args = {}) => {
    const tool = tools.find((t) => t.name === name)!;
    return (await tool.run(tool.input.parse(args) as never)) as string;
  };
}

describe('whole prefabs over the bridge', () => {
  it('finds prefabs by words, saying how big each is and what it holds', async () => {
    const found = JSON.parse(await gm()('find_prefabs', { search: 'farmer house' })) as {
      total: number;
      prefabs: object[];
    };
    expect(found.total).toBe(1);
    expect(found.prefabs[0]).toMatchObject({
      id: 'cottage',
      pack: 'bw',
      compendium: 'houses',
      name: 'Farmer Cottage',
      squares: [4, 3],
      tiles: 2,
      roofs: 1,
      walls: 3,
      doors: 1,
      windows: 1,
      lights: 1,
      pictures: ['cottage-floor', 'cottage-roof'],
    });
  });

  it('lists what matches without opening each one when asked for many', async () => {
    const found = JSON.parse(await gm()('find_prefabs', { search: 'town', details: false })) as {
      total: number;
      prefabs: { id: string; squares?: unknown }[];
    };
    expect(found.total).toBe(2);
    expect(found.prefabs.map((p) => p.id)).toEqual(['well', 'cottage']);
    expect(found.prefabs[0]!.squares).toBeUndefined();
  });

  it('builds a prefab whole on the scene, its middle on the point, at the scene’s square size', async () => {
    const tools = gm();
    await tools('create_scene', { name: 'Hamlet', width: 40, height: 40 });
    const said = await tools('build_scene', { scene: 'hamlet', prefabs: [{ prefab: 'cottage', x: 10, y: 10 }] });
    expect(said).toMatch(/tiles/);
    const tiles = store.docs.all('hamlet/tiles');
    // 4 x 3 squares of 100 px round (1000, 1000).
    const floor = tiles.find((t) => t.src === 'pack://bw/media/cottage-floor.webp');
    expect(floor).toMatchObject({ x: 800, y: 850, w: 400, h: 300 });
    expect(tiles.find((t) => t.overhead)).toMatchObject({ x: 800, y: 850, src: 'pack://bw/media/cottage-roof.webp' });
    const walls = store.docs.all('hamlet/walls');
    expect(walls).toHaveLength(3);
    expect(walls.find((w) => w.door)).toMatchObject({ a: [800, 950], b: [800, 1050] });
    expect(store.docs.all('hamlet/lights')[0]).toMatchObject({ x: 1000, y: 1000 });
  });

  it('turns prefabs, keeps two of the same apart by id, and lays them over the build’s own tiles', async () => {
    const tools = gm();
    await tools('create_scene', { name: 'Row', width: 40, height: 40 });
    await tools('build_scene', {
      scene: 'row',
      units: 'pixels',
      prefabs: [
        { prefab: 'cottage', x: 1000, y: 1000 },
        { prefab: 'cottage', x: 3000, y: 1000, rotation: 90 },
      ],
      tiles: [{ id: 'table', kind: 'rect', x: 950, y: 950, w: 100, h: 100, color: '#553311' }],
    });
    const tiles = store.docs.all('row/tiles');
    const floors = tiles.filter((t) => t.src === 'pack://bw/media/cottage-floor.webp');
    expect(floors).toHaveLength(2);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(tiles.length);
    expect(floors[1]).toMatchObject({ rotation: 90 });
    expect(tiles.findIndex((t) => t.id === 'table')).toBeLessThan(tiles.indexOf(floors[0]!));
    expect(store.docs.all('row/walls')).toHaveLength(6);
    // A turned door runs along x, not y.
    const turned = store.docs.all('row/walls').filter((w) => w.door)[1]!;
    expect((turned.a as number[])[1]).toBeCloseTo((turned.b as number[])[1]!);
  });

  it('says which prefab it could not find', async () => {
    const tools = gm();
    await expect(tools('build_scene', { prefabs: [{ prefab: 'palace', x: 1, y: 1 }] })).rejects.toThrow(/palace/);
  });
});

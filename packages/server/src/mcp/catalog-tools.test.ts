import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../game.ts';
import { PackStore } from '../library/pack-store.ts';
import { GameStore } from '../store/game-store.ts';
import { makeTwoScenes } from '../test/fixtures.ts';
import { mcpTools } from './mcp-tools.ts';

// Claude building maps from a pack's asset catalog (a Baileywiki pack) over
// the bridge: finding pieces, a ground in its texture, and props, scatter
// and floors from it, 2D pictures on a flat scene and models on a 3D one.

let dir: string;
let store: GameStore;
let game: Game;

async function put(root: string, path: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), typeof data === 'string' ? data : JSON.stringify(data));
}

const piece = (id: string, kind: string, w: number, extra: object = {}) => ({
  id,
  src: `media/${id}.${kind === 'model' ? 'glb' : 'webp'}`,
  kind,
  name: id.replace(/-/g, ' '),
  tags: id.split('-'),
  w,
  h: w,
  ...extra,
});

beforeEach(async () => {
  dir = await makeTwoScenes();
  const packDir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
  await put(packDir, 'bw/pack.json', { id: 'bw', name: 'Baileywiki' });
  await put(packDir, 'bw/catalog.json', {
    format: 1,
    assets: [
      piece('oak-tree', 'tile', 30, { overhead: true }),
      piece('oak-tree-3d', 'model', 20, { height: 40 }),
      piece('grass-tileable', 'texture', 135),
      piece('wood-floor-tileable', 'texture', 50),
    ],
  });
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

describe('building from the asset catalog', () => {
  it('finds pieces with their sizes', async () => {
    const found = JSON.parse(await gm()('find_assets', { search: 'oak', kind: 'tile' })) as {
      total: number;
      assets: { id: string; w: number; src: string }[];
    };
    expect(found.total).toBe(1);
    expect(found.assets[0]).toMatchObject({ id: 'oak-tree', w: 30, src: 'pack://bw/media/oak-tree.webp' });
  });

  it('lays a new scene’s ground in the pack’s texture', async () => {
    await gm()('create_scene', { name: 'Glade', width: 30, height: 20, ground: 'grass' });
    expect(store.docs.all('glade/tiles')).toEqual([
      expect.objectContaining({ kind: 'rect', pattern: 'pack://bw/media/grass-tileable.webp', textureScale: 27 }),
    ]);
  });

  it('places 2D pictures on a flat scene and models on a 3D one', async () => {
    const tools = gm();
    await tools('create_scene', { name: 'Flat', width: 20, height: 20 });
    await tools('create_scene', { name: 'Deep', width: 20, height: 20, view: '3d' });
    const bp = { props: [{ asset: 'oak tree', x: 5, y: 5 }], rooms: [{ x: 10, y: 10, w: 4, h: 4, floor: 'wood' }] };
    await tools('build_scene', { scene: 'flat', ...bp });
    await tools('build_scene', { scene: 'deep', ...bp });
    const flat = store.docs.all('flat/tiles');
    expect(flat).toContainEqual(expect.objectContaining({ src: 'pack://bw/media/oak-tree.webp', overhead: true }));
    expect(flat).toContainEqual(expect.objectContaining({ pattern: 'pack://bw/media/wood-floor-tileable.webp' }));
    const models = store.docs.all('deep/tiles').map((t) => (t.model as { src?: string } | undefined)?.src);
    expect(models).toContain('pack://bw/media/oak-tree-3d.glb');
  });
});

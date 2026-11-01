import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { importFoundry } from './foundry-import.ts';
import { PackStore } from './pack-store.ts';

let src: string;
let packsDir: string;

async function put(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(src, path)), { recursive: true });
  await writeFile(join(src, path), typeof data === 'string' ? data : JSON.stringify(data));
}

const cave = {
  _id: 'aaa',
  name: 'Goblin Cave',
  width: 1000,
  height: 1000,
  grid: { size: 100, type: 1, distance: 5 },
  background: { src: 'modules/goblin-maps/maps/cave.webp' },
  walls: [{ c: [300, 300, 500, 300], move: 20, sight: 20 }],
  tiles: [{ texture: { src: 'modules/goblin-maps/tiles/barrel.png' }, x: 400, y: 400, width: 100, height: 100 }],
};

beforeEach(async () => {
  src = await mkdtemp(join(tmpdir(), 'foundry-module-'));
  packsDir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
  await put('module.json', {
    id: 'goblin-maps',
    title: 'Goblin Maps',
    version: '2.1.0',
    authors: [{ name: 'Mapmaker' }],
    description: '<p>Caves &amp; <b>lairs</b></p>',
    packs: [
      { name: 'maps', label: 'Maps', type: 'Scene', path: 'packs/maps.db' },
      { name: 'monsters', label: 'Monsters', type: 'Actor', path: 'packs/monsters.db' },
      { name: 'newer', label: 'Newer maps', type: 'Scene', path: 'packs/newer' },
    ],
  });
  await put('maps/cave.webp', 'cave');
  await put('tiles/barrel.png', 'barrel');
  await put('scripts/module.js', 'code');
  const deleted = { _id: 'bbb', $$deleted: true };
  await put(
    'packs/maps.db',
    [JSON.stringify(cave), JSON.stringify({ _id: 'bbb', name: 'Gone' }), JSON.stringify(deleted)].join('\n'),
  );
  await put('packs/monsters.db', `${JSON.stringify({ _id: 'm', name: 'Goblin' })}\n`);
  await put('packs/newer/000005.ldb', 'leveldb');
  await put('exports/fvtt-Scene-goblin-cave.json', { ...cave, name: 'Goblin Cave' });
});

describe('importing a Foundry module', () => {
  it('copies its media into a new pack, keeping the folders', async () => {
    const report = await importFoundry(src, packsDir);
    expect(report).toMatchObject({ id: 'goblin-maps', media: 2 });
    expect(await readFile(join(packsDir, 'goblin-maps/media/maps/cave.webp'), 'utf8')).toBe('cave');
    await expect(stat(join(packsDir, 'goblin-maps/media/scripts/module.js'))).rejects.toThrow();
    const packs = new PackStore(packsDir);
    await packs.load();
    expect(packs.problems).toEqual([]);
    expect(packs.get('goblin-maps')).toMatchObject({
      name: 'Goblin Maps',
      version: '2.1.0',
      author: 'Mapmaker',
      description: 'Caves & lairs',
      system: null,
      source: 'foundry:module',
    });
    expect((await packs.media('goblin-maps')).map((m) => [m.name, m.tags])).toEqual([
      ['cave', ['maps']],
      ['barrel', ['tiles']],
    ]);
  });

  it('turns the scenes of its old-style compendia and scene exports into a scene compendium', async () => {
    const report = await importFoundry(src, packsDir);
    expect(report.scenes).toBe(2);
    const packs = new PackStore(packsDir);
    await packs.load();
    const scenes = packs.compendium('goblin-maps', 'scenes')!;
    expect(scenes.docs.map((s) => (s as { id: string }).id)).toEqual(['goblin-cave', 'goblin-cave-2']);
    expect(scenes.docs[0]).toMatchObject({
      tiles: [
        { id: 'background', src: 'pack://goblin-maps/media/maps/cave.webp' },
        { src: 'pack://goblin-maps/media/tiles/barrel.png' },
      ],
      walls: [{ a: [300, 300] }],
    });
  });

  it('says what it could not bring along', async () => {
    const { skipped } = await importFoundry(src, packsDir);
    expect(skipped).toEqual([
      'compendium "monsters" (Actor): only scenes are imported so far',
      'compendium "newer": a Foundry v11+ database, which cannot be read yet (export its scenes with "Export Data" and import again)',
    ]);
  });

  it('refuses to overwrite a pack unless told to, and takes another id when asked', async () => {
    await importFoundry(src, packsDir);
    await expect(importFoundry(src, packsDir)).rejects.toThrow(/already installed/);
    await expect(importFoundry(src, packsDir, { overwrite: true })).resolves.toMatchObject({ id: 'goblin-maps' });
    await expect(importFoundry(src, packsDir, { id: 'Goblin Maps 2' })).resolves.toMatchObject({ id: 'goblin-maps-2' });
  });

  it('imports a world folder, whose scenes are in data/', async () => {
    const world = await mkdtemp(join(tmpdir(), 'foundry-world-'));
    await mkdir(join(world, 'data'), { recursive: true });
    await mkdir(join(world, 'maps'));
    await writeFile(join(world, 'world.json'), JSON.stringify({ name: 'my-campaign', title: 'My Campaign' }));
    await writeFile(join(world, 'maps', 'keep.jpg'), 'keep');
    const keep = { ...cave, name: 'Keep', background: { src: 'worlds/my-campaign/maps/keep.jpg' } };
    await writeFile(join(world, 'data', 'scenes.db'), JSON.stringify(keep));
    const report = await importFoundry(world, packsDir);
    expect(report).toMatchObject({ id: 'my-campaign', media: 1, scenes: 1 });
  });

  it('refuses a folder that is no Foundry module, world or system', async () => {
    await expect(importFoundry(packsDir, packsDir)).rejects.toThrow(/module.json/);
  });
});

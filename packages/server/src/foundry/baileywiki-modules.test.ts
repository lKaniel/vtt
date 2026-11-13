import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrefabSchema, SceneEntrySchema } from '@vtt/shared';
import { importBaileywikiModules } from './baileywiki-modules.ts';
import { PackStore } from '../library/pack-store.ts';
import { writeLevelDb } from '../test/leveldb-writer.ts';

let modules: string;
let packsDir: string;

async function put(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(modules, path)), { recursive: true });
  await writeFile(join(modules, path), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}

const preset = (id: string, p: object) => ({
  _id: id,
  name: id,
  pages: [],
  folder: 'F1',
  flags: { 'multi-token-edit': { preset: { id, addSubtract: [], randomize: [], ...p } } },
});

beforeEach(async () => {
  modules = await mkdtemp(join(tmpdir(), 'foundry-modules-'));
  packsDir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
  await put('baileywiki-maps/module.json', {
    id: 'baileywiki-maps',
    packs: [
      { name: 'maps', type: 'Scene', path: 'packs/maps' },
      { name: 'prefabs', type: 'JournalEntry', path: 'packs/prefabs' },
    ],
  });
  await put('baileywiki-maps/maps/docks.webp', 'docks');
  await put('baileywiki-maps/maps/lamp.webp', 'lamp');
  await put('baileywiki-maps/models/crate.glb', 'glb');
  await put('baileywiki-maps/models/crate.bin', 'bin');
  await put('baileywiki-maps/models/crate.webp', 'thumb');
  await put('baileywiki-maps/scripts/init.js', 'code');
  await put(
    'baileywiki-maps/mass_edit_cache.json',
    gzipSync(
      JSON.stringify([
        {
          source: 'data',
          index: [
            {
              dir: 'modules',
              dirs: [
                {
                  dir: 'baileywiki-maps',
                  dirs: [{ dir: 'models', files: [{ name: 'crate.glb', tags: ['3d-model'], thumb: 'crate.webp' }] }],
                },
              ],
            },
          ],
        },
      ]),
    ),
  );
  await writeLevelDb(join(modules, 'baileywiki-maps/packs/maps'), {
    '!scenes!S1': {
      _id: 'S1',
      name: 'Gray Harbor Docks',
      width: 1000,
      height: 800,
      padding: 0,
      grid: { size: 100, type: 1, distance: 5 },
      background: { src: 'modules/baileywiki-maps/maps/docks.webp' },
      tiles: [{ texture: { src: 'modules/jb2a_patreon/fire.webm' }, x: 0, y: 0, width: 100, height: 100 }],
      walls: [],
    },
    '!scenes!S2': {
      _id: 'S2',
      name: 'Market With A Statue',
      width: 1000,
      height: 800,
      padding: 0,
      grid: { size: 100, type: 1, distance: 5 },
      background: { src: 'modules/baileywiki-maps/maps/docks.webp' },
      tiles: [
        {
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          texture: { src: 'modules/levels-3d-preview/assets/blank.webp' },
          flags: { 'levels-3d-preview': { model3d: 'modules/baileywiki-maps/models/crate.glb' } },
        },
      ],
      walls: [],
    },
  });
  await writeLevelDb(join(modules, 'baileywiki-maps/packs/prefabs'), {
    '!folders!F1': { _id: 'F1', name: 'Lighting', type: 'JournalEntry' },
    '!journal!P1': preset('P1', {
      name: 'Street Lamp',
      documentName: 'Tile',
      tags: ['town'],
      data: [{ texture: { src: 'modules/baileywiki-maps/maps/lamp.webp' }, x: 100, y: 100, width: 100, height: 100 }],
      attached: [{ documentName: 'AmbientLight', data: { x: 150, y: 150, config: { bright: 10, dim: 20 } } }],
    }),
    '!folders!F2': { _id: 'F2', name: 'Baileywiki 3D Prefabs', type: 'JournalEntry' },
    '!journal!P3': {
      ...preset('P3', {
        name: '3DFX Smoke',
        documentName: 'Tile',
        data: [{ texture: { src: 'modules/baileywiki-maps/maps/lamp.webp' }, x: 0, y: 0, width: 100, height: 100 }],
      }),
      folder: 'F2',
    },
    '!journal!P1copy': {
      ...preset('P1', {
        name: 'Street Lamp',
        documentName: 'Tile',
        tags: ['bw'],
        data: [{ texture: { src: 'modules/baileywiki-maps/maps/lamp.webp' }, x: 100, y: 100, width: 100, height: 100 }],
      }),
      _id: 'P1copy',
    },
    '!journal!P2': preset('P2', {
      name: 'Crate',
      documentName: 'Tile',
      data: [
        {
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          texture: { src: 'modules/levels-3d-preview/assets/blank.webp' },
          flags: { 'levels-3d-preview': { model3d: 'modules/baileywiki-maps/models/crate.glb', depth: 50 } },
        },
      ],
    }),
  });
  await put('baileywiki-nuts-and-bolts/module.json', {
    id: 'baileywiki-nuts-and-bolts',
    packs: [{ name: 'me-scenes-2d', type: 'JournalEntry', path: 'packs/me-scenes-2d' }],
  });
  await put('baileywiki-nuts-and-bolts/scenes/thumbs/S1.webp', 'thumb');
  await writeLevelDb(join(modules, 'baileywiki-nuts-and-bolts/packs/me-scenes-2d'), {
    '!journal!B1': preset('B1', {
      name: 'Docks',
      documentName: 'FauxScene',
      img: 'modules/baileywiki-nuts-and-bolts/scenes/thumbs/S1.webp',
      tags: ['settlement', 'docks'],
      data: [{ uuid: 'Compendium.baileywiki-maps.maps.Scene.S1' }],
    }),
  });
  await put('other-module/module.json', { id: 'other-module' });
});

describe('importing the installed Baileywiki modules', () => {
  it('copies every module’s media where Foundry has it, glTF buffers too, never code', async () => {
    const report = await importBaileywikiModules(modules, packsDir);
    expect(report.modules).toEqual(['baileywiki-maps', 'baileywiki-nuts-and-bolts']);
    const at = (p: string) => readFile(join(packsDir, 'baileywiki/media/modules', p), 'utf8');
    expect(await at('baileywiki-maps/maps/docks.webp')).toBe('docks');
    expect(await at('baileywiki-maps/models/crate.bin')).toBe('bin');
    await expect(at('baileywiki-maps/scripts/init.js')).rejects.toThrow();
    const again = await importBaileywikiModules(modules, packsDir);
    expect(again.copied).toBe(0);
  });

  it('makes split scene and prefab compendia the GM can browse by tag and thumbnail', async () => {
    await importBaileywikiModules(modules, packsDir);
    const packs = new PackStore(packsDir);
    await packs.load();
    expect(packs.problems).toEqual([]);
    expect(packs.compendium('baileywiki', 'bw-scenes-2d')?.docs[0]).toEqual({
      id: 'gray-harbor-docks',
      name: 'Gray Harbor Docks',
      thumb: 'pack://baileywiki/media/modules/baileywiki-nuts-and-bolts/scenes/thumbs/S1.webp',
      tags: ['maps', 'settlement', 'docks'],
      stub: true,
    });
    const scene = SceneEntrySchema.parse(await packs.compendiumDoc('baileywiki', 'bw-scenes-2d', 'gray-harbor-docks'));
    expect(scene.tiles[0]).toMatchObject({ src: 'pack://baileywiki/media/modules/baileywiki-maps/maps/docks.webp' });
    const lamp = PrefabSchema.parse(await packs.compendiumDoc('baileywiki', 'bw-prefabs-2d', 'street-lamp'));
    expect(lamp.tags).toEqual(['lighting', 'town', 'bw']);
    expect(packs.compendium('baileywiki', 'bw-prefabs-2d')?.docs.map((d) => (d as { id: string }).id)).toEqual([
      'street-lamp',
    ]);
    expect(lamp.lights).toHaveLength(1);
    const crate = PrefabSchema.parse(await packs.compendiumDoc('baileywiki', 'bw-prefabs-3d', 'crate'));
    expect(crate.tiles[0]).toMatchObject({
      model: { src: 'pack://baileywiki/media/modules/baileywiki-maps/models/crate.glb' },
    });
  });

  it('files scenes and prefabs as 3D only when 3D Canvas opens them so or Baileywiki files them so', async () => {
    await importBaileywikiModules(modules, packsDir);
    const packs = new PackStore(packsDir);
    await packs.load();
    const ids = (c: string) => packs.compendium('baileywiki', c)?.docs.map((d) => (d as { id: string }).id);
    expect(ids('bw-scenes-2d')).toContain('market-with-a-statue');
    expect(ids('bw-scenes-3d') ?? []).not.toContain('market-with-a-statue');
    expect(ids('bw-prefabs-3d')).toEqual(['3dfx-smoke', 'crate']);
  });

  it('tags the media with Baileywiki’s own tags and gives 3D models their thumbnails', async () => {
    await importBaileywikiModules(modules, packsDir);
    const packs = new PackStore(packsDir);
    await packs.load();
    const crate = packs.listedMedia('baileywiki').find((m) => m.name === 'crate');
    expect(crate).toMatchObject({
      kind: 'model',
      thumb: 'pack://baileywiki/media/modules/baileywiki-maps/models/crate.webp',
    });
    expect(crate?.tags).toContain('3d-model');
    expect(packs.listedMedia('baileywiki').filter((m) => m.name === 'crate')).toHaveLength(1);
  });

  it('keeps the scenes downloaded with a Baileywiki sign-in', async () => {
    await mkdir(join(packsDir, 'baileywiki/compendia'), { recursive: true });
    await writeFile(join(packsDir, 'baileywiki/compendia/scenes.json'), '[]');
    await writeFile(
      join(packsDir, 'baileywiki/pack.json'),
      JSON.stringify({
        id: 'baileywiki',
        name: 'Baileywiki',
        compendia: [{ id: 'scenes', type: 'scene', path: 'compendia/scenes.json' }],
      }),
    );
    await importBaileywikiModules(modules, packsDir);
    const manifest = JSON.parse(await readFile(join(packsDir, 'baileywiki/pack.json'), 'utf8')) as {
      compendia: { id: string }[];
    };
    expect(manifest.compendia.map((c) => c.id)).toEqual(['scenes', 'bw-scenes-2d', 'bw-prefabs-2d', 'bw-prefabs-3d']);
  });

  it('says which files the scenes and prefabs name that no module has', async () => {
    const report = await importBaileywikiModules(modules, packsDir);
    expect(report.skipped).toContain('1 file(s) from jb2a_patreon are not in the pack');
    expect(report.missing).toEqual(['modules/jb2a_patreon/fire.webm']);
    expect(await readFile(join(packsDir, 'baileywiki/missing-files.txt'), 'utf8')).toBe(
      'modules/jb2a_patreon/fire.webm\n',
    );
  });

  it('online, names the Baileywiki files no module has, which the server fetches when first asked', async () => {
    await put('baileywiki-content/module.json', {
      id: 'baileywiki-content',
      packs: [{ name: 'prefabs-01', type: 'JournalEntry', path: 'packs/prefabs-01' }],
    });
    await writeLevelDb(join(modules, 'baileywiki-content/packs/prefabs-01'), {
      '!journal!P9': preset('P9', {
        name: 'Barrel',
        documentName: 'Tile',
        data: [{ texture: { src: 'modules/baileywiki-3d/maps/barrel.webp' }, x: 0, y: 0, width: 50, height: 50 }],
      }),
    });
    const report = await importBaileywikiModules(modules, packsDir, { modules: ['baileywiki-content'], online: true });
    const packs = new PackStore(packsDir);
    await packs.load();
    const barrel = PrefabSchema.parse(await packs.compendiumDoc('baileywiki', 'bw-prefabs-2d', 'barrel'));
    expect(barrel.tiles[0]).toMatchObject({ src: 'pack://baileywiki/media/modules/baileywiki-3d/maps/barrel.webp' });
    expect(report.missing).toEqual([]);
    const catalog = JSON.parse(await readFile(join(packsDir, 'baileywiki/catalog.json'), 'utf8')) as {
      assets: { src: string }[];
    };
    expect(catalog.assets.map((a) => a.src)).toContain('media/modules/baileywiki-3d/maps/barrel.webp');
  });

  it('online, keeps an asset catalog measured from the files', async () => {
    await mkdir(join(packsDir, 'baileywiki'), { recursive: true });
    await writeFile(
      join(packsDir, 'baileywiki/catalog.json'),
      JSON.stringify({ format: 1, source: 'baileywiki', assets: [] }),
    );
    await importBaileywikiModules(modules, packsDir, { online: true });
    expect(JSON.parse(await readFile(join(packsDir, 'baileywiki/catalog.json'), 'utf8'))).toMatchObject({
      source: 'baileywiki',
    });
  });
});

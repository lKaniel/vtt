import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zip } from '../library/zip.ts';
import { writeLevelDb } from './leveldb-writer.ts';

// Baileywiki's Content Module as foundrymods.com hands it out, for tests: a
// zip of the module folder with one prefab compendium (a street lamp whose
// pictures stay on Baileywiki's server), a scene browser thumbnail and code.

export async function contentModuleZip(): Promise<Buffer> {
  const build = await mkdtemp(join(tmpdir(), 'bcm-build-'));
  await writeLevelDb(join(build, 'packs/bwprefabs-01'), {
    '!journal!P1': {
      _id: 'P1',
      name: 'Street Lamp',
      pages: [],
      flags: {
        'multi-token-edit': {
          preset: {
            id: 'P1',
            name: 'Street Lamp',
            documentName: 'Tile',
            img: 'modules/baileywiki-maps/thumbs/lamp.svg',
            tags: ['town'],
            addSubtract: [],
            randomize: [],
            data: [{ texture: { src: 'modules/baileywiki-maps/maps/lamp.webp' }, x: 0, y: 0, width: 100, height: 100 }],
          },
        },
      },
    },
  });
  const entries = [];
  for (const name of await readdir(join(build, 'packs/bwprefabs-01')))
    entries.push({
      path: `baileywiki-content/packs/bwprefabs-01/${name}`,
      data: await readFile(join(build, 'packs/bwprefabs-01', name)),
    });
  const manifest = {
    id: 'baileywiki-content',
    packs: [{ name: 'prefabs-01', type: 'JournalEntry', path: 'packs/bwprefabs-01' }],
  };
  return zip([
    { path: 'baileywiki-content/module.json', data: Buffer.from(JSON.stringify(manifest)) },
    { path: 'baileywiki-content/module/init.mjs', data: Buffer.from('code') },
    { path: 'baileywiki-content/scenes/thumbs/2d/S1.webp', data: Buffer.from('thumb') },
    ...entries,
  ]);
}

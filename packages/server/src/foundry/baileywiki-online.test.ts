import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrefabSchema } from '@vtt/shared';
import { installBaileywikiLibrary, refreshBaileywikiLibrary } from './baileywiki-online.ts';
import { PackStore } from '../library/pack-store.ts';
import { contentModuleZip } from '../test/fake-content-module.ts';

let data: string;
let packsDir: string;

let asked: string[];
let body: Buffer;
const get = (url: string) => {
  asked.push(url);
  if (url.endsWith('/manifest'))
    return Promise.resolve(new Response(JSON.stringify({ download: 'https://mods.test/bcm.zip' })));
  return Promise.resolve(
    url === 'https://mods.test/bcm.zip' ? new Response(new Uint8Array(body)) : new Response('', { status: 404 }),
  );
};

beforeEach(async () => {
  data = await mkdtemp(join(tmpdir(), 'vtt-data-'));
  packsDir = join(data, 'packs');
  asked = [];
  body = await contentModuleZip();
});

describe("Baileywiki's library from the Content Module", () => {
  it('downloads the module and makes its Mass Edit presets prefabs whose files Baileywiki serves', async () => {
    const report = await installBaileywikiLibrary(packsDir, { manifest: 'https://mods.test/manifest', get });
    expect(asked).toEqual(['https://mods.test/manifest', 'https://mods.test/bcm.zip']);
    expect(report.prefabs).toBe(1);
    const packs = new PackStore(packsDir);
    await packs.load();
    expect(packs.compendium('baileywiki', 'bw-prefabs-2d')?.docs[0]).toMatchObject({
      name: 'Street Lamp',
      thumb: 'pack://baileywiki/media/modules/baileywiki-maps/thumbs/lamp.svg',
    });
    const lamp = PrefabSchema.parse(await packs.compendiumDoc('baileywiki', 'bw-prefabs-2d', 'street-lamp'));
    expect(lamp.tiles[0]).toMatchObject({ src: 'pack://baileywiki/media/modules/baileywiki-maps/maps/lamp.webp' });
  });

  it('keeps the module’s own pictures, the scene browsers’ thumbnails, and none of its code', async () => {
    await installBaileywikiLibrary(packsDir, { manifest: 'https://mods.test/manifest', get });
    const thumb = join(packsDir, 'baileywiki/media/modules/baileywiki-content/scenes/thumbs/2d/S1.webp');
    expect(await readFile(thumb, 'utf8')).toBe('thumb');
    await expect(readFile(join(data, 'baileywiki-module/baileywiki-content/module/init.mjs'))).rejects.toThrow();
  });

  it('says so when the module can’t be downloaded', async () => {
    const down = () => Promise.resolve(new Response('', { status: 503 }));
    await expect(
      installBaileywikiLibrary(packsDir, { manifest: 'https://mods.test/manifest', get: down }),
    ).rejects.toThrow(/503/);
  });

  describe('after the server is updated', () => {
    const install = () => installBaileywikiLibrary(packsDir, { manifest: 'https://mods.test/manifest', get });
    const lamp = join('baileywiki/compendia/bw-prefabs-2d/street-lamp.json');

    it('leaves a library its own importer made alone', async () => {
      await install();
      expect(await refreshBaileywikiLibrary(packsDir)).toBeUndefined();
    });

    it('imports the downloaded module again when an older importer made the library', async () => {
      await install();
      await writeFile(join(packsDir, 'baileywiki/import.json'), JSON.stringify({ importer: 0 }));
      await rm(join(packsDir, lamp));
      const report = await refreshBaileywikiLibrary(packsDir);
      expect(report?.prefabs).toBe(1);
      expect(asked).toHaveLength(2);
      expect(PrefabSchema.parse(JSON.parse(await readFile(join(packsDir, lamp), 'utf8'))).grid).toBe(100);
      expect(await refreshBaileywikiLibrary(packsDir)).toBeUndefined();
    });

    it('does nothing where the module was never downloaded', async () => {
      expect(await refreshBaileywikiLibrary(packsDir)).toBeUndefined();
    });
  });
});

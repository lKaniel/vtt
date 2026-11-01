import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PackStore } from './pack-store.ts';

let dir: string;

async function put(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), typeof data === 'string' ? data : JSON.stringify(data));
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
  await put('forest/pack.json', {
    id: 'forest',
    name: 'Forest',
    compendia: [{ id: 'clearings', type: 'scene', path: 'compendia/clearings.json' }],
  });
  await put('forest/compendia/clearings.json', [{ id: 'glade', name: 'Glade' }]);
  await put('forest/media/Trees/oak.webp', 'x');
  await put('forest/media/Trees/Dead_Trees/stump.png', 'x');
  await put('forest/media/readme.txt', 'x');
});

describe('the packs installed on a server', () => {
  it('finds every folder with a pack.json, and its compendia', async () => {
    const packs = new PackStore(dir);
    await packs.load();
    expect(packs.list().map((p) => p.id)).toEqual(['forest']);
    expect(packs.compendium('forest', 'clearings')?.docs).toEqual([{ id: 'glade', name: 'Glade' }]);
    expect(packs.compendium('forest', 'nope')).toBeUndefined();
    expect(packs.problems).toEqual([]);
  });

  it('reports packs it cannot read, and goes on without them', async () => {
    await put('broken/pack.json', { id: 'Broken!', name: 'x' });
    await put('elsewhere/pack.json', { id: 'not-elsewhere', name: 'x' });
    await put('lost/pack.json', { id: 'lost', name: 'Lost', compendia: [{ id: 'a', type: 'scene', path: 'a.json' }] });
    const packs = new PackStore(dir);
    await packs.load();
    expect(packs.list().map((p) => p.id)).toEqual(['forest', 'lost']);
    expect(packs.compendium('lost', 'a')).toBeUndefined();
    expect(packs.problems).toEqual([
      expect.stringMatching(/^broken\/pack\.json: id/),
      'elsewhere/pack.json: its id is "not-elsewhere" but its folder is "elsewhere"',
      'lost/pack.json: compendium "a" has no readable list in a.json',
    ]);
  });

  it('has no packs when the folder is missing', async () => {
    const packs = new PackStore(join(dir, 'missing'));
    await packs.load();
    expect(packs.list()).toEqual([]);
  });

  it('lists a pack’s media with the folders as tags', async () => {
    const packs = new PackStore(dir);
    await packs.load();
    expect(await packs.media('forest')).toEqual([
      {
        src: 'pack://forest/media/Trees/Dead_Trees/stump.png',
        name: 'stump',
        kind: 'image',
        tags: ['trees', 'dead trees'],
        pack: 'forest',
      },
      { src: 'pack://forest/media/Trees/oak.webp', name: 'oak', kind: 'image', tags: ['trees'], pack: 'forest' },
    ]);
    expect(await packs.media('nope')).toEqual([]);
  });

  it('serves only files in a pack’s media folder', async () => {
    const packs = new PackStore(dir);
    await packs.load();
    expect(packs.mediaFile('forest', 'media/Trees/oak.webp')).toBe(join(dir, 'forest/media/Trees/oak.webp'));
    expect(packs.mediaFile('forest', 'pack.json')).toBeUndefined();
    expect(packs.mediaFile('forest', 'media/../pack.json')).toBeUndefined();
    expect(packs.mediaFile('nope', 'media/x.png')).toBeUndefined();
  });
});

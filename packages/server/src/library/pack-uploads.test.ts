import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PackStore } from './pack-store.ts';
import { PackUploads } from './pack-uploads.ts';

// Packs put on the server from Setup, file by file, so a pack of many
// gigabytes goes up without a zip and picks up where a broken upload left off.

let packs: PackStore;
let uploads: PackUploads;

const forest = { id: 'forest', name: 'Forest', license: 'private' };
const chunks = (text: string) => [Buffer.from(text)];
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

beforeEach(async () => {
  packs = new PackStore(await mkdtemp(join(tmpdir(), 'vtt-packs-')));
  await packs.load();
  uploads = new PackUploads(packs);
});

describe('uploading a pack', () => {
  it('takes its pack.json, then its files, then installs it in one go', async () => {
    expect(await uploads.begin(forest)).toEqual({ id: 'forest', have: { 'pack.json': expect.any(Number) as number } });
    expect(await uploads.pending()).toEqual(['forest']);
    await uploads.putFile('forest', 'media/trees/oak.webp', chunks('oak'));
    expect(packs.get('forest')).toBeUndefined();
    const installed = await uploads.finish('forest');
    expect(installed.name).toBe('Forest');
    expect(packs.get('forest')?.name).toBe('Forest');
    expect(await readFile(join(packs.dir, 'forest/media/trees/oak.webp'), 'utf8')).toBe('oak');
    expect(await readdir(packs.dir)).toContain('forest');
    expect(await uploads.pending()).toEqual([]);
  });

  it('says which files are up already, so a broken upload goes on where it stopped', async () => {
    await uploads.begin(forest);
    await uploads.putFile('forest', 'media/a.webp', chunks('aaaa'));
    const again = await uploads.begin(forest);
    expect(again.have).toEqual({ 'media/a.webp': 4, 'pack.json': expect.any(Number) as number });
  });

  it('replaces a pack installed before, and starts afresh when the new one is another pack', async () => {
    await uploads.begin(forest);
    await uploads.putFile('forest', 'media/old.webp', chunks('old'));
    await uploads.finish('forest');
    await uploads.begin({ ...forest, name: 'Forest 2' });
    await uploads.putFile('forest', 'media/new.webp', chunks('new'));
    await uploads.finish('forest');
    expect(packs.get('forest')?.name).toBe('Forest 2');
    expect(await exists(join(packs.dir, 'forest/media/old.webp'))).toBe(false);
  });

  it('refuses a pack.json that is not one, and paths outside the pack', async () => {
    await expect(uploads.begin({ id: 'Not An Id!', name: 'x' })).rejects.toThrow(/pack\.json/);
    await uploads.begin(forest);
    for (const bad of ['../escape.webp', '/abs.webp', 'media/../../x', 'media\\x.webp', '', 'media//x']) {
      await expect(uploads.putFile('forest', bad, chunks('x'))).rejects.toThrow(/Not a file/);
    }
    await expect(uploads.putFile('lake', 'media/x.webp', chunks('x'))).rejects.toThrow(/Start/);
    await expect(uploads.finish('lake')).rejects.toThrow(/Start/);
  });

  it('refuses a file bigger than the most it takes, leaving nothing half written', async () => {
    const small = new PackUploads(packs, 3);
    await small.begin(forest);
    await expect(small.putFile('forest', 'media/big.webp', chunks('four'))).rejects.toThrow(/too big/);
    expect((await small.begin(forest)).have).not.toHaveProperty('media/big.webp');
  });

  it('can be called off, and an installed pack deleted', async () => {
    await uploads.begin(forest);
    await uploads.cancel('forest');
    await expect(uploads.finish('forest')).rejects.toThrow(/Start/);
    await mkdir(join(packs.dir, 'lake'), { recursive: true });
    await writeFile(join(packs.dir, 'lake/pack.json'), JSON.stringify({ id: 'lake', name: 'Lake' }));
    await packs.load();
    await uploads.remove('lake');
    expect(packs.get('lake')).toBeUndefined();
    await expect(uploads.remove('lake')).rejects.toThrow(/No such pack/);
  });
});

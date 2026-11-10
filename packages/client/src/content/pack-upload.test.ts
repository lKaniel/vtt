import { describe, expect, it } from 'vitest';
import { packFolder, toSend, uploadPack, type PackUploadApi } from './pack-upload.ts';

// Setup's pack upload: the folder the admin picked, which of its files go
// up (all but those already on the server), and the upload itself.

const file = (path: string, text = 'x') =>
  Object.assign(new File([text], path.split('/').pop()!), { webkitRelativePath: path });

describe('a pack folder picked in the browser', () => {
  it('is the folder with pack.json at its top, whatever folder it sits in', async () => {
    const folder = await packFolder([
      file('downloads/forest/media/oak.webp'),
      file('downloads/forest/pack.json', '{"id":"forest","name":"Forest"}'),
      file('downloads/forest/media/deep/pack.json', '{}'),
      file('downloads/other.txt'),
    ]);
    expect(folder.manifest).toEqual({ id: 'forest', name: 'Forest' });
    expect(folder.files.map((f) => f.path)).toEqual(['media/deep/pack.json', 'media/oak.webp']);
  });

  it('must have a readable pack.json', async () => {
    await expect(packFolder([file('forest/media/oak.webp')])).rejects.toThrow(/pack\.json/);
    await expect(packFolder([file('forest/pack.json', 'not json')])).rejects.toThrow(/pack\.json/);
  });

  it('sends only what the server lacks or has a different size of', async () => {
    const folder = await packFolder([
      file('forest/pack.json', '{"id":"forest"}'),
      file('forest/media/a.webp', 'aaaa'),
      file('forest/media/b.webp', 'bb'),
      file('forest/media/c.webp', 'c'),
    ]);
    const send = toSend(folder.files, { 'media/a.webp': 4, 'media/b.webp': 1 });
    expect(send.map((f) => f.path)).toEqual(['media/b.webp', 'media/c.webp']);
  });
});

describe('uploading a pack', () => {
  it('begins, sends each missing file, reports progress and finishes', async () => {
    const sent: string[] = [];
    const progress: [number, number][] = [];
    const api: PackUploadApi = {
      beginPack: () => Promise.resolve({ id: 'forest', have: { 'media/a.webp': 1 } }),
      putPackFile: (_id, path) => {
        sent.push(path);
        return Promise.resolve({});
      },
      finishPack: (id) => Promise.resolve({ pack: { id, name: 'Forest' } }),
    };
    const folder = await packFolder([
      file('forest/pack.json', '{"id":"forest"}'),
      file('forest/media/a.webp', 'a'),
      file('forest/media/b.webp', 'bb'),
      file('forest/media/c.webp', 'ccc'),
    ]);
    const pack = await uploadPack(api, folder, (done, total) => progress.push([done, total]));
    expect(pack.name).toBe('Forest');
    expect(sent.toSorted((a, b) => a.localeCompare(b))).toEqual(['media/b.webp', 'media/c.webp']);
    expect(progress.at(-1)).toEqual([5, 5]);
  });
});

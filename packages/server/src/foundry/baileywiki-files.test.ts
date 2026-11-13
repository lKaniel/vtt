import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BaileywikiFiles } from './baileywiki-files.ts';
import type { BaileywikiClient } from './baileywiki-client.ts';

let packsDir: string;
let asked: string[];
let clients: number;
let now: number;

const client = {
  bytes: (path: string) => {
    asked.push(path);
    if (path.includes('locked')) return Promise.reject(new Error('Access denied'));
    return Promise.resolve(Buffer.from(`bytes of ${path}`));
  },
} as unknown as BaileywikiClient;

const account = {
  client: () => {
    clients++;
    return Promise.resolve(client);
  },
};

beforeEach(async () => {
  packsDir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
  asked = [];
  clients = 0;
  now = 0;
});

const files = () => new BaileywikiFiles(account, packsDir, () => now);

describe('Baileywiki files fetched when first asked', () => {
  it('downloads a file of the Baileywiki pack once, then serves it from the pack', async () => {
    const f = files();
    const path = 'media/modules/baileywiki-maps/maps/lamp.webp';
    const [a, b] = await Promise.all([f.fetch('baileywiki', path), f.fetch('baileywiki', path)]);
    expect(a).toBe(join(packsDir, 'baileywiki', path));
    expect(b).toBe(a);
    expect(await readFile(a!, 'utf8')).toBe('bytes of modules/baileywiki-maps/maps/lamp.webp');
    expect(asked).toEqual(['modules/baileywiki-maps/maps/lamp.webp']);
  });

  it('asks Baileywiki only for its own media, in the Baileywiki pack', async () => {
    const f = files();
    expect(await f.fetch('other', 'media/modules/baileywiki-maps/a.webp')).toBeUndefined();
    expect(await f.fetch('baileywiki', 'media/modules/jb2a/fire.webm')).toBeUndefined();
    expect(await f.fetch('baileywiki', 'media/modules/baileywiki-maps/../../x.webp')).toBeUndefined();
    expect(await f.fetch('baileywiki', 'pack.json')).toBeUndefined();
    expect(asked).toEqual([]);
  });

  it('remembers a file Baileywiki refused for a while, and signs in once for many files', async () => {
    const f = files();
    expect(await f.fetch('baileywiki', 'media/modules/baileywiki-maps/locked.webp')).toBeUndefined();
    expect(await f.fetch('baileywiki', 'media/modules/baileywiki-maps/locked.webp')).toBeUndefined();
    await f.fetch('baileywiki', 'media/modules/baileywiki-maps/b.webp');
    expect(asked).toEqual(['modules/baileywiki-maps/locked.webp', 'modules/baileywiki-maps/b.webp']);
    expect(clients).toBe(1);
    now = 60 * 60_000;
    await f.fetch('baileywiki', 'media/modules/baileywiki-maps/locked.webp');
    expect(asked).toHaveLength(3);
    expect(clients).toBe(2);
  });
});

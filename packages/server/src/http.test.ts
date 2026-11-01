import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { httpHandler } from './http.ts';

let server: Server;
let base: string;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vtt-http-'));
  await mkdir(join(dir, 'assets'));
  await mkdir(join(dir, 'client'));
  await writeFile(join(dir, 'assets', 'map.png'), 'png');
  await mkdir(join(dir, 'other', 'assets'), { recursive: true });
  await writeFile(join(dir, 'other', 'assets', 'map.png'), 'other png');
  await writeFile(join(dir, 'client', 'index.html'), '<h1>vtt</h1>');
  await writeFile(join(dir, 'secret.txt'), 'nope');
  await mkdir(join(dir, 'packs', 'forest', 'media'), { recursive: true });
  await writeFile(join(dir, 'packs', 'forest', 'media', 'big oak.webp'), 'oak');
  const handle = httpHandler({
    packFile: (pack, path) => (pack === 'forest' && path.startsWith('media/') ? join(dir, 'packs', pack, path) : undefined),
    // The home game is "home"; "other" is a game made in the lobby.
    assetsDir: (game) => ({ other: join(dir, 'other', 'assets'), home: join(dir, 'assets') })[game ?? 'home'],
    clientDir: join(dir, 'client'),
    players: () => [{ id: 'gm', name: 'GM', role: 'gm', color: '#fff' }],
  });
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((done) => server.listen(0, done));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

describe('httpHandler', () => {
  it('lists the seats', async () => {
    const res = await fetch(`${base}/api/players`);
    expect(await res.json()).toEqual([{ id: 'gm', name: 'GM', role: 'gm', color: '#fff' }]);
  });

  it('serves assets with their type', async () => {
    const res = await fetch(`${base}/assets/map.png`);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(await res.text()).toBe('png');
  });

  it('serves each game its own assets', async () => {
    expect(await (await fetch(`${base}/games/other/assets/map.png`)).text()).toBe('other png');
    expect(await (await fetch(`${base}/games/nope/assets/map.png`)).text()).toBe('<h1>vtt</h1>');
  });

  it('serves pack media, and nothing else of a pack', async () => {
    const res = await fetch(`${base}/packs/forest/media/big%20oak.webp`);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(await res.text()).toBe('oak');
    expect(await (await fetch(`${base}/packs/forest/pack.json`)).text()).toBe('<h1>vtt</h1>');
  });

  it('falls back to the client for unknown paths', async () => {
    expect(await (await fetch(`${base}/some/page`)).text()).toBe('<h1>vtt</h1>');
  });

  it('never leaves the folder it serves', async () => {
    const res = await fetch(`${base}/assets/..%2F..%2Fsecret.txt`);
    expect(await res.text()).not.toBe('nope');
  });
});

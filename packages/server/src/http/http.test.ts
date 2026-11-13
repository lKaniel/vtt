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
  await mkdir(join(dir, 'client', 'draco'));
  await writeFile(join(dir, 'client', 'draco', 'draco_decoder.wasm'), 'wasm');
  await writeFile(join(dir, 'assets', 'wall.glb'), 'glb');
  await writeFile(join(dir, 'secret.txt'), 'nope');
  await writeFile(join(dir, 'main.js'), 'export default () => {};');
  await mkdir(join(dir, 'packs', 'forest', 'media'), { recursive: true });
  await writeFile(join(dir, 'packs', 'forest', 'media', 'big oak.webp'), 'oak');
  const handle = httpHandler({
    packFile: (pack, path) =>
      pack === 'forest' && path.startsWith('media/') ? join(dir, 'packs', pack, path) : undefined,
    // The home game is "home"; "other" is a game made in the lobby.
    assetsDir: (game) => ({ other: join(dir, 'other', 'assets'), home: join(dir, 'assets') })[game ?? 'home'],
    packFetch: async (pack, path, req) => {
      if (pack !== 'forest' || req.headers.cookie !== 'vtt=ok') return undefined;
      await writeFile(join(dir, 'packs', pack, path), `fetched ${path}`);
      return join(dir, 'packs', pack, path);
    },
    pluginFile: (plugin, path) => (plugin === 'turn-alert' && path === 'main.js' ? join(dir, 'main.js') : undefined),
    clientDir: join(dir, 'client'),
  });
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((done) => server.listen(0, done));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

describe('httpHandler', () => {
  it('fetches a pack file it hasn’t got, when the pack fetches files and the request may have them', async () => {
    expect(await (await fetch(`${base}/packs/forest/media/far.webp`)).text()).toBe('<h1>vtt</h1>');
    const asked = await fetch(`${base}/packs/forest/media/near.webp`, { headers: { cookie: 'vtt=ok' } });
    expect(asked.headers.get('content-type')).toBe('image/webp');
    expect(await asked.text()).toBe('fetched media/near.webp');
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

  it('serves the files of installed plugins as modules', async () => {
    const res = await fetch(`${base}/plugins/turn-alert/main.js`);
    expect(res.headers.get('content-type')).toBe('text/javascript');
    expect(await res.text()).toBe('export default () => {};');
    expect(await (await fetch(`${base}/plugins/turn-alert/secret.txt`)).text()).toBe('<h1>vtt</h1>');
  });

  it('serves models and the Draco decoder with their types', async () => {
    expect((await fetch(`${base}/assets/wall.glb`)).headers.get('content-type')).toBe('model/gltf-binary');
    expect((await fetch(`${base}/draco/draco_decoder.wasm`)).headers.get('content-type')).toBe('application/wasm');
  });

  it('falls back to the client for unknown paths', async () => {
    expect(await (await fetch(`${base}/some/page`)).text()).toBe('<h1>vtt</h1>');
  });

  it('never leaves the folder it serves', async () => {
    const res = await fetch(`${base}/assets/..%2F..%2Fsecret.txt`);
    expect(await res.text()).not.toBe('nope');
  });
});

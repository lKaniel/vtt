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
  await writeFile(join(dir, 'client', 'index.html'), '<h1>vtt</h1>');
  await writeFile(join(dir, 'secret.txt'), 'nope');
  const handle = httpHandler({
    assetsDir: join(dir, 'assets'),
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

  it('falls back to the client for unknown paths', async () => {
    expect(await (await fetch(`${base}/some/page`)).text()).toBe('<h1>vtt</h1>');
  });

  it('never leaves the folder it serves', async () => {
    const res = await fetch(`${base}/assets/..%2F..%2Fsecret.txt`);
    expect(await res.text()).not.toBe('nope');
  });
});

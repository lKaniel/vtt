import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_PASSWORD, startApi, type ApiServer } from './test/api-server.ts';
import { unzip, zip } from './zip.ts';

// Backups from the game's page, and a game as a zip file: exported by its
// GM, imported as a new game in Setup.

let api: ApiServer;

afterEach(async () => {
  await api.close();
});

/** The home game's GM. */
const homeGm = () => api.joined('test', 'gm');

async function raw(method: string, path: string, body?: Buffer, cookie = '') {
  const res = await fetch(`${api.base}${path}`, { method, headers: { cookie }, body });
  return { status: res.status, type: res.headers.get('content-type'), body: Buffer.from(await res.arrayBuffer()) };
}

/** The session cookie of a browser that joined the home game as `player`, or (no player) gave the admin password. */
async function cookieOf(player?: string): Promise<string> {
  const res = await fetch(`${api.base}/api/${player ? 'games/test/join' : 'admin'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(player ? { player } : { password: ADMIN_PASSWORD }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

describe('backups from the lobby', () => {
  it('the GM makes one, sees the list and restores it', async () => {
    api = await startApi();
    const gm = await homeGm();
    const made = await gm('POST', '/api/games/test/backups');
    expect(made.status).toBe(200);
    const id = (made.json.backup as { id: string }).id;
    const before = await readFile(join(api.home, 'scenes/main/walls.json'), 'utf8');
    await writeFile(join(api.home, 'scenes/main/walls.json'), '[]');
    const list = (await gm('GET', '/api/games/test/backups')).json.backups as { id: string; reason: string }[];
    expect(list.map((b) => b.id)).toContain(id);
    expect((await gm('POST', `/api/games/test/backups/${id}/restore`)).status).toBe(200);
    expect(await readFile(join(api.home, 'scenes/main/walls.json'), 'utf8')).toBe(before);
    const after = (await gm('GET', '/api/games/test/backups')).json.backups as { reason: string }[];
    expect(after[0]!.reason).toBe('restore');
  });

  it('is the GM’s', async () => {
    api = await startApi();
    const bo = await api.joined('test', 'bo');
    expect((await bo('GET', '/api/games/test/backups')).status).toBe(403);
    expect((await bo('POST', '/api/games/test/backups')).status).toBe(403);
  });

  it('a game is backed up when it loads', async () => {
    api = await startApi();
    await api.hub.open('test');
    expect((await api.hub.backups.list('test')).map((b) => b.reason)).toContain('load');
  });
});

describe('a game as a zip', () => {
  it('exports for its GM and imports in Setup as a new game, players and all', async () => {
    api = await startApi();
    const player = await cookieOf('ana');
    expect((await raw('GET', '/api/games/test/export', undefined, player)).status).toBe(403);
    const cookie = await cookieOf('gm');
    const exported = await raw('GET', '/api/games/test/export', undefined, cookie);
    expect(exported.type).toBe('application/zip');
    const paths = unzip(exported.body).map((f) => f.path);
    expect(paths).toContain('game.json');
    expect(paths).toContain('scenes/main/walls.json');

    expect((await raw('POST', '/api/games/import-zip', exported.body, player)).status).toBe(403);
    const imported = await raw('POST', '/api/games/import-zip', exported.body, await cookieOf());
    expect(imported.status).toBe(200);
    const game = (JSON.parse(imported.body.toString()) as { game: { id: string; you: string } }).game;
    expect(game).toMatchObject({ id: 'test-2', you: 'gm' });
    const file = JSON.parse(await readFile(join(api.dataDir, 'games/test-2/game.json'), 'utf8')) as {
      id: string;
      players: { id: string }[];
    };
    expect(file.id).toBe('test-2');
    expect(file.players.map((p) => p.id)).toEqual(['gm', 'ana', 'bo']);
  });

  it('finds the game in a folder inside the zip', async () => {
    api = await startApi();
    const cookie = await cookieOf();
    const game = { id: 'x', name: 'Cellar', scene: 'main', players: [] };
    const files = [
      { path: 'cellar/game.json', data: Buffer.from(JSON.stringify(game)) },
      { path: 'cellar/scenes/main/scene.json', data: Buffer.from('{"name":"Main","darkness":0}') },
    ];
    const res = await raw('POST', '/api/games/import-zip', zip(files), cookie);
    expect(JSON.parse(res.body.toString())).toMatchObject({ game: { id: 'cellar', name: 'Cellar' } });
  });

  it('refuses a zip without a game', async () => {
    api = await startApi();
    const cookie = await cookieOf();
    const res = await raw('POST', '/api/games/import-zip', zip([{ path: 'a.txt', data: Buffer.from('a') }]), cookie);
    expect(res.status).toBe(400);
    expect(res.body.toString()).toMatch(/game\.json/);
  });
});

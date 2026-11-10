import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startApi, type ApiServer } from '../test/api-server.ts';

// Setup's nightly backups off the server: the admin sees where they go and
// which nights there are, makes one now, and puts a game back from a night.

let api: ApiServer;

afterEach(async () => {
  await api.close();
});

describe('off-server backups in Setup', () => {
  it('say there is no backup storage when the server has none', async () => {
    api = await startApi();
    const admin = await api.admin();
    const res = await admin('GET', '/api/offsite');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ status: { target: null }, nights: [] });
    expect((await admin('POST', '/api/offsite')).status).toBe(400);
  });

  it('are the admin’s alone', async () => {
    api = await startApi({ offsite: true });
    const gm = await api.joined('test', 'gm');
    expect((await gm('GET', '/api/offsite')).status).toBe(403);
    expect((await gm('POST', '/api/offsite')).status).toBe(403);
  });

  it('make a night now, list it and put a game back from it', async () => {
    api = await startApi({ offsite: true });
    const admin = await api.admin();
    const made = await admin('POST', '/api/offsite');
    expect(made.status).toBe(200);
    const night = (made.json.night as { night: string }).night;
    const listed = await admin('GET', '/api/offsite');
    expect(listed.json.nights).toEqual([{ night, games: ['test'] }]);
    expect(listed.json.status).toMatchObject({ lastRun: { night, games: 1 }, running: false });

    const walls = join(api.home, 'scenes/main/walls.json');
    const before = await readFile(walls, 'utf8');
    await writeFile(walls, '[]');
    expect((await admin('POST', `/api/offsite/${night}/test/restore`)).status).toBe(200);
    expect(await readFile(walls, 'utf8')).toBe(before);
    expect((await admin('POST', `/api/offsite/${night}/nothing/restore`)).status).toBe(400);
    expect((await admin('DELETE', '/api/offsite')).status).toBe(405);
  });
});

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startApi, type ApiServer } from '../test/api-server.ts';

// Setup's packs: the admin sees what is installed, uploads a pack folder
// file by file, and deletes one.

let api: ApiServer;

afterEach(async () => {
  await api.close();
});

async function putFile(cookie: string, path: string, data: string) {
  const url = `${api.base}/api/packs/forest/files/${path.split('/').map(encodeURIComponent).join('/')}`;
  return (await fetch(url, { method: 'PUT', headers: { cookie }, body: data })).status;
}

async function adminCookie(): Promise<string> {
  const res = await fetch(`${api.base}/api/admin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'open sesame' }),
  });
  return res.headers.get('set-cookie')!.split(';')[0]!;
}

describe('packs in Setup', () => {
  it('upload file by file, install, list and delete', async () => {
    api = await startApi();
    const admin = await api.admin();
    expect((await admin('GET', '/api/packs')).json).toEqual({ packs: [], pending: [] });
    const begun = await admin('POST', '/api/packs/upload', { id: 'forest', name: 'Forest' });
    expect(begun.json).toMatchObject({ id: 'forest' });
    const cookie = await adminCookie();
    expect(await putFile(cookie, 'media/Dead Trees/oak #1.webp', 'oak')).toBe(200);
    expect(await putFile(cookie, 'media\\x.webp', 'x')).toBe(400);
    expect((await admin('GET', '/api/packs')).json.pending).toEqual(['forest']);
    const done = await admin('POST', '/api/packs/forest/finish');
    expect(done.json).toMatchObject({ pack: { id: 'forest', name: 'Forest' } });
    expect(await readFile(join(api.hub.packs.dir, 'forest/media/Dead Trees/oak #1.webp'), 'utf8')).toBe('oak');
    expect((await admin('GET', '/api/packs')).json.packs).toEqual([
      expect.objectContaining({ id: 'forest', name: 'Forest' }),
    ]);
    expect((await admin('DELETE', '/api/packs/forest')).status).toBe(200);
    expect((await admin('GET', '/api/packs')).json.packs).toEqual([]);
  });

  it('call off an upload', async () => {
    api = await startApi();
    const admin = await api.admin();
    await admin('POST', '/api/packs/upload', { id: 'forest', name: 'Forest' });
    expect((await admin('DELETE', '/api/packs/forest/upload')).status).toBe(200);
    expect((await admin('GET', '/api/packs')).json.pending).toEqual([]);
    expect((await admin('PATCH', '/api/packs/forest')).status).toBe(405);
  });

  it('are the admin’s alone', async () => {
    api = await startApi();
    const gm = await api.joined('test', 'gm');
    expect((await gm('GET', '/api/packs')).status).toBe(403);
    expect((await gm('POST', '/api/packs/upload', { id: 'forest', name: 'Forest' })).status).toBe(403);
    expect(await putFile('', 'media/x.webp', 'x')).toBe(403);
  });
});

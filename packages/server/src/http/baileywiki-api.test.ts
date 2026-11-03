import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startApi, type ApiServer } from '../test/api-server.ts';
import { GOOD_CODE, startFakeBaileywiki, townCompendium, type FakeBaileywiki } from '../test/fake-baileywiki.ts';

// The admin signs the server in to Baileywiki with the code
// content.baileywiki.com shows, picks scenes from Baileywiki's online
// compendia, and the server downloads what the account unlocks into a
// private "baileywiki" pack that games can then use.

let api: ApiServer;
let bw: FakeBaileywiki;

beforeEach(async () => {
  bw = await startFakeBaileywiki();
  townCompendium(bw);
  api = await startApi({ baileywiki: bw.base });
});

afterEach(async () => {
  await api.close();
  await bw.close();
});

type Json = Record<string, unknown>;

describe('signing in to Baileywiki', () => {
  it('is for the admin only', async () => {
    expect((await api.client()('GET', '/api/baileywiki')).status).toBe(403);
    expect((await api.client()('POST', '/api/baileywiki/sign-in', { code: GOOD_CODE })).status).toBe(403);
  });

  it('checks the code with Baileywiki and keeps it on the server', async () => {
    const admin = await api.admin();
    expect((await admin('GET', '/api/baileywiki')).json).toMatchObject({ signedIn: false, tier: 'none' });
    expect((await admin('POST', '/api/baileywiki/sign-in', { code: 'wrong' })).status).toBe(400);
    const res = await admin('POST', '/api/baileywiki/sign-in', { code: GOOD_CODE });
    expect(res.json).toEqual({ signedIn: true, tier: 'standard', signInUrl: `${bw.base}/` });
    expect(JSON.stringify((await admin('GET', '/api/baileywiki')).json)).not.toContain(GOOD_CODE);
    expect((await admin('DELETE', '/api/baileywiki')).json).toMatchObject({ signedIn: false });
  });

  it('signs out by itself when Baileywiki stops taking the code', async () => {
    const admin = await api.admin();
    await admin('POST', '/api/baileywiki/sign-in', { code: GOOD_CODE });
    bw.lapse();
    const res = await admin('GET', '/api/baileywiki/scenes');
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('sign in again');
    expect((await admin('GET', '/api/baileywiki')).json).toMatchObject({ signedIn: false });
  });
});

describe('Baileywiki scenes', () => {
  it('lists the online compendia once signed in, with public previews', async () => {
    const admin = await api.admin();
    expect((await admin('GET', '/api/baileywiki/scenes')).status).toBe(400);
    await admin('POST', '/api/baileywiki/sign-in', { code: GOOD_CODE });
    const { scenes } = (await admin('GET', '/api/baileywiki/scenes')).json as { scenes: Json[] };
    expect(scenes).toEqual([
      {
        compendium: 'baileywiki-content.maps',
        id: 'town00000000001',
        name: 'Town Square',
        group: 'Baileywiki 2D Scenes',
        thumb: `${bw.base}/api/files/thumbnail?file_path=${encodeURIComponent('modules/baileywiki-maps-premium/thumbs/town.webp')}`,
        imported: false,
      },
    ]);
  });

  it('downloads a scene and its Baileywiki files into the private pack', async () => {
    const admin = await api.admin();
    await admin('POST', '/api/baileywiki/sign-in', { code: GOOD_CODE });
    const res = await admin('POST', '/api/baileywiki/import', {
      scenes: [{ compendium: 'baileywiki-content.maps', id: 'town00000000001' }],
    });
    expect(res.json).toMatchObject({ pack: 'baileywiki', scenes: 1, media: 2 });
    const pack = join(api.dataDir, 'packs', 'baileywiki');
    expect(await readFile(join(pack, 'media/modules/baileywiki-maps-premium/tiles/tree big.webp'), 'utf8')).toBe(
      'tree picture',
    );
    const scenes = JSON.parse(await readFile(join(pack, 'compendia/scenes.json'), 'utf8')) as Json[];
    expect(scenes).toHaveLength(1);
    expect(JSON.stringify(scenes[0])).toContain('pack://baileywiki/media/modules/baileywiki-maps-premium/tiles/');
    expect(api.hub.packs.get('baileywiki')).toMatchObject({ name: 'Baileywiki' });
    expect(bw.asked).not.toContain('modules/jb2a/x.webp');
    const listed = (await admin('GET', '/api/baileywiki/scenes')).json as { scenes: Json[] };
    expect(listed.scenes[0]).toMatchObject({ imported: true });
  });

  it('imports a scene again in place, without downloading its files twice', async () => {
    const admin = await api.admin();
    await admin('POST', '/api/baileywiki/sign-in', { code: GOOD_CODE });
    const pick = { scenes: [{ compendium: 'baileywiki-content.maps', id: 'town00000000001' }] };
    await admin('POST', '/api/baileywiki/import', pick);
    const again = await admin('POST', '/api/baileywiki/import', pick);
    expect(again.json).toMatchObject({ scenes: 1, media: 0 });
    const pack = join(api.dataDir, 'packs', 'baileywiki');
    expect(JSON.parse(await readFile(join(pack, 'compendia/scenes.json'), 'utf8'))).toHaveLength(1);
  });

  it("reports the files the account doesn't unlock", async () => {
    bw.locked.add('modules/baileywiki-maps-premium/maps/town.webp');
    const admin = await api.admin();
    await admin('POST', '/api/baileywiki/sign-in', { code: GOOD_CODE });
    const res = await admin('POST', '/api/baileywiki/import', {
      scenes: [{ compendium: 'baileywiki-content.maps', id: 'town00000000001' }],
    });
    expect(res.json).toMatchObject({ scenes: 1, media: 1 });
    expect((res.json.skipped as string[]).join('\n')).toContain('modules/baileywiki-maps-premium/maps/town.webp');
  });
});

describe('Baileywiki inside a game', () => {
  it("is open to that game's GM, not its players", async () => {
    const gm = await api.joined('test', 'gm');
    const ana = await api.joined('test', 'ana');
    expect((await ana('GET', '/api/baileywiki?game=test')).status).toBe(403);
    expect((await gm('GET', '/api/baileywiki')).status).toBe(403);
    expect((await gm('POST', '/api/baileywiki/sign-in?game=test', { code: GOOD_CODE })).json).toMatchObject({
      signedIn: true,
    });
    expect((await gm('GET', '/api/baileywiki/scenes?game=nope')).status).toBe(403);
  });

  it('hands back the imported scenes, for the GM to add to the game', async () => {
    const gm = await api.joined('test', 'gm');
    await gm('POST', '/api/baileywiki/sign-in?game=test', { code: GOOD_CODE });
    const res = await gm('POST', '/api/baileywiki/import?game=test', {
      scenes: [{ compendium: 'baileywiki-content.maps', id: 'town00000000001' }],
    });
    expect(res.json.entries).toMatchObject([{ id: 'town-square', name: 'Town Square' }]);
  });
});

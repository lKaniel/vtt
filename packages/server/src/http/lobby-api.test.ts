import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { socketSeat } from '../socket-join.ts';
import { startApi, type ApiServer } from '../test/api-server.ts';
import { FakeSocket } from '../test/fixtures.ts';

// Games Foundry style: everyone sees the games and their players, joins one
// by picking a player (with its password, if it has one), and the admin
// password opens Setup (making, importing, deleting games).

let api: ApiServer;

beforeEach(async () => {
  api = await startApi();
});

afterEach(async () => {
  await api.close();
});

type Json = Record<string, unknown>;

const ws = (url: string, cookie = '') => ({ url, headers: { cookie } }) as never;

describe('the games list', () => {
  it('shows every game to everyone, with the systems a new one can use', async () => {
    const res = await api.client()('GET', '/api/games');
    expect(res.json.systems).toMatchObject([
      { id: 'dnd5e', name: 'Dungeons & Dragons 5e', editions: [{ id: '2014' }, { id: '2024' }] },
    ]);
    expect(res.json.games).toMatchObject([
      {
        id: 'test',
        name: 'Test',
        systemName: 'Dungeons & Dragons 5e',
        rules: '2014',
        you: null,
        members: 3,
        home: true,
      },
    ]);
    const ana = await api.joined('test', 'ana');
    expect(((await ana('GET', '/api/games')).json.games as Json[])[0]).toMatchObject({ you: 'player' });
  });

  it("shows a game's players to anyone, for its join screen", async () => {
    const res = await api.client()('GET', '/api/games/test');
    expect(res.json.game).toMatchObject({
      manage: false,
      players: [
        { id: 'gm', role: 'gm', online: false },
        { id: 'ana', role: 'player' },
        { id: 'bo', role: 'player' },
      ],
    });
    expect((res.json.game as Json).me).toBeUndefined();
    expect((await api.client()('GET', '/api/games/nope')).status).toBe(404);
  });
});

describe('joining a game', () => {
  it('picks a player, and the game connection is that player', async () => {
    const call = api.client();
    const joined = await call('POST', '/api/games/test/join', { player: 'ana' });
    expect(joined).toMatchObject({ status: 200, json: { player: { id: 'ana', role: 'player' } } });
    expect((await call('GET', '/api/games/test')).json.game).toMatchObject({ me: 'ana', you: 'player' });
    const cookie = `vtt_session=${[...(await sessionsOf())][0]}`;
    expect(await socketSeat(ws('/ws?game=test', cookie), api)).toMatchObject({ game: 'test', player: { id: 'ana' } });
    expect(await socketSeat(ws('/ws?game=test'), api)).toBeUndefined();
    await call('POST', '/api/games/test/leave');
    expect((await call('GET', '/api/games/test')).json.game).toMatchObject({ you: null });
  });

  it("asks for the player's password when it has one", async () => {
    const gm = await api.joined('test', 'gm');
    await gm('PUT', '/api/games/test/players/ana/password', { password: 'secret' });
    const call = api.client();
    expect((await call('POST', '/api/games/test/join', { player: 'ana' })).json.error).toMatch(/has a password/);
    expect((await call('POST', '/api/games/test/join', { player: 'ana', password: 'nope' })).status).toBe(403);
    expect((await call('POST', '/api/games/test/join', { player: 'ana', password: 'secret' })).status).toBe(200);
    const players = ((await call('GET', '/api/games/test')).json.game as { players: Json[] }).players;
    expect(players.find((p) => p.id === 'ana')).toMatchObject({ locked: true });
    expect((await call('POST', '/api/games/test/join', { player: 'zed' })).status).toBe(404);
  });

  it('keeps a player to one browser: another is turned away while they play, and takes over after', async () => {
    const first = api.client();
    await first('POST', '/api/games/test/join', { player: 'ana' });
    const [firstToken] = [...(await sessionsOf())];
    const socket = new FakeSocket();
    const seat = (await socketSeat(ws('/ws?game=test', `vtt_session=${firstToken}`), api))!;
    expect(seat.taken).toBe(false);
    api.hub.connect('test', socket.asWebSocket, seat.player, firstToken);
    const second = api.client();
    const refused = await second('POST', '/api/games/test/join', { player: 'ana' });
    expect(refused.status).toBe(409);
    expect(refused.json.error).toMatch(/Ana is already playing/);
    expect((await first('POST', '/api/games/test/join', { player: 'ana' })).status).toBe(200);
    socket.close();
    expect((await second('POST', '/api/games/test/join', { player: 'ana' })).status).toBe(200);
    expect(await socketSeat(ws('/ws?game=test', `vtt_session=${firstToken}`), api)).toBeUndefined();
  });

  it('turns a second browser away from a seat in play, but not the GM', async () => {
    const tokens = [await api.sessions.start(), await api.sessions.start()];
    for (const token of tokens) await api.sessions.sit(token, 'test', 'ana');
    const cookie = (i: number) => `vtt_session=${tokens[i]}`;
    const one = (await socketSeat(ws('/ws?game=test', cookie(0)), api))!;
    api.hub.connect('test', new FakeSocket().asWebSocket, one.player, tokens[0]);
    expect((await socketSeat(ws('/ws?game=test', cookie(1)), api))?.taken).toBe(true);
    expect((await socketSeat(ws('/ws?game=test', cookie(0)), api))?.taken).toBe(false);
    for (const token of tokens) await api.sessions.sit(token, 'test', 'gm');
    const gm = (await socketSeat(ws('/ws?game=test', cookie(0)), api))!;
    api.hub.connect('test', new FakeSocket().asWebSocket, gm.player, tokens[0]);
    expect((await socketSeat(ws('/ws?game=test', cookie(1)), api))?.taken).toBe(false);
  });

  it('lets a player change their own password, but no one else’s', async () => {
    const ana = await api.joined('test', 'ana');
    expect((await ana('PUT', '/api/games/test/players/ana/password', { password: 'mine' })).status).toBe(200);
    expect((await ana('PUT', '/api/games/test/players/bo/password', { password: 'x' })).status).toBe(403);
    expect(api.hub.access.locked('test')).toEqual(['ana']);
  });
});

describe('players', () => {
  it('are added by the GM, with a role and a password', async () => {
    const gm = await api.joined('test', 'gm');
    const made = await gm('POST', '/api/games/test/players', { name: 'Cy Rus', role: 'trusted', password: 'pw' });
    expect(made).toMatchObject({ status: 200, json: { player: { id: 'cy-rus', name: 'Cy Rus', role: 'trusted' } } });
    expect((await gm('POST', '/api/games/test/players', { name: 'cy rus' })).json.error).toMatch(/of that name/);
    expect((await api.client()('POST', '/api/games/test/join', { player: 'cy-rus', password: 'pw' })).status).toBe(200);
    const ana = await api.joined('test', 'ana');
    expect((await ana('POST', '/api/games/test/players', { name: 'Dee' })).status).toBe(403);
  });

  it('change role or leave at the GM’s word, and a game keeps a GM', async () => {
    const gm = await api.joined('test', 'gm');
    const bo = await api.joined('test', 'bo');
    expect((await bo('PUT', '/api/games/test/players/bo', { role: 'gm' })).status).toBe(403);
    expect((await gm('PUT', '/api/games/test/players/bo', { role: 'trusted' })).status).toBe(200);
    expect((await gm('PUT', '/api/games/test/players/gm', { role: 'player' })).json.error).toMatch(/GM/);
    expect((await gm('DELETE', '/api/games/test/players/bo')).status).toBe(200);
    expect((await bo('GET', '/api/games/test')).json.game).toMatchObject({ you: null });
  });

  it('are managed by the admin in any game, without joining it', async () => {
    const admin = await api.admin();
    expect((await admin('GET', '/api/games/test')).json.game).toMatchObject({ manage: true });
    expect((await admin('PUT', '/api/games/test/players/gm/password', { password: 'pw' })).status).toBe(200);
  });
});

describe('Setup', () => {
  it('makes games for the admin only, joined as its Gamemaster', async () => {
    const ana = await api.joined('test', 'ana');
    const input = { name: 'Lost Mine', system: 'dnd5e', rules: '2024' };
    expect((await ana('POST', '/api/games', input)).status).toBe(403);
    const admin = await api.admin();
    const made = await admin('POST', '/api/games', input);
    expect(made).toMatchObject({ status: 200, json: { game: { id: 'lost-mine', you: 'gm', rules: '2024' } } });
    expect((await admin('GET', '/api/games/lost-mine')).json.game).toMatchObject({
      me: 'gamemaster',
      players: [{ id: 'gamemaster', name: 'Gamemaster', role: 'gm' }],
    });
  });

  it('explains what a new game is missing', async () => {
    const admin = await api.admin();
    const res = await admin('POST', '/api/games', { name: 'X', system: 'gurps', rules: '2014' });
    expect(res).toMatchObject({ status: 400, json: { error: 'Pick a system.' } });
  });

  it('deletes games, but never the one the server was started with', async () => {
    const admin = await api.admin();
    await admin('POST', '/api/games', { name: 'One', system: 'dnd5e', rules: '2014' });
    const gm = await api.joined('one', 'gamemaster');
    expect((await gm('DELETE', '/api/games/one')).status).toBe(403);
    expect((await admin('DELETE', '/api/games/one')).status).toBe(200);
    expect(api.hub.ids()).toEqual(['test']);
    expect((await admin('DELETE', '/api/games/test')).json.error).toMatch(/started with/);
  });
});

describe('the admin password', () => {
  it('opens Setup for whoever gives it', async () => {
    const call = api.client();
    expect((await call('GET', '/api/session')).json).toMatchObject({ admin: false, adminPassword: true });
    expect((await call('POST', '/api/admin', { password: 'nope' })).status).toBe(403);
    expect((await call('POST', '/api/admin', { password: 'open sesame' })).status).toBe(200);
    expect((await call('GET', '/api/session')).json).toMatchObject({ admin: true, home: { id: 'test' } });
    await call('DELETE', '/api/admin');
    expect((await call('GET', '/api/session')).json).toMatchObject({ admin: false });
  });

  it('leaves Setup open to anyone until one is set, and is set in Setup', async () => {
    await api.close();
    api = await startApi({ adminPassword: null });
    const first = api.client();
    expect((await first('GET', '/api/session')).json).toMatchObject({ admin: true, adminPassword: false });
    expect((await first('PUT', '/api/admin', { password: 'castle' })).status).toBe(200);
    expect((await first('GET', '/api/session')).json).toMatchObject({ admin: true, adminPassword: true });
    const other = api.client();
    expect((await other('GET', '/api/session')).json).toMatchObject({ admin: false });
    expect((await other('PUT', '/api/admin', { password: 'mine' })).status).toBe(403);
    expect((await other('POST', '/api/admin', { password: 'castle' })).status).toBe(200);
  });

  it('can’t be changed in Setup when the server sets it', async () => {
    const admin = await api.admin();
    expect((await admin('PUT', '/api/admin', { password: 'castle' })).json.error).toMatch(/VTT_ADMIN_PASSWORD/);
  });
});

async function sessionsOf(): Promise<string[]> {
  const { readFile } = await import('node:fs/promises');
  return Object.keys(JSON.parse(await readFile(join(api.dataDir, 'sessions.json'), 'utf8')) as Json);
}

describe('importing a Foundry world', () => {
  async function foundryWorld(): Promise<string> {
    const dir = join(await mkdtemp(join(tmpdir(), 'foundry-')), 'worlds', 'lost-keep');
    await mkdir(join(dir, 'data'), { recursive: true });
    await writeFile(
      join(dir, 'world.json'),
      JSON.stringify({ id: 'lost-keep', title: 'The Lost Keep', system: 'dnd5e' }),
    );
    await writeFile(
      join(dir, 'data', 'scenes.db'),
      JSON.stringify({ _id: 's', name: 'Keep', width: 500, height: 500 }),
    );
    await writeFile(join(dir, 'data', 'actors.db'), JSON.stringify({ _id: 'a', name: 'Goblin', type: 'npc' }));
    return dir;
  }

  it('makes a new game from a world folder on the server, joined as its Gamemaster', async () => {
    const kaniel = await api.admin();
    const res = await kaniel('POST', '/api/games/import-foundry', { folder: await foundryWorld() });
    expect(res).toMatchObject({
      status: 200,
      json: { game: { id: 'the-lost-keep', name: 'The Lost Keep', you: 'gm' }, report: { scenes: 1, actors: 1 } },
    });
    expect((await kaniel('GET', '/api/games/the-lost-keep')).status).toBe(200);
    const again = await kaniel('POST', '/api/games/import-foundry', { folder: await foundryWorld(), name: 'Keep 2' });
    expect(again.json).toMatchObject({ game: { id: 'keep-2', name: 'Keep 2' } });
  });

  it("is the server admin's, since it reads the server's disk", async () => {
    const ana = await api.joined('test', 'ana');
    const res = await ana('POST', '/api/games/import-foundry', { folder: await foundryWorld() });
    expect(res.status).toBe(403);
  });

  it('imports the world again into the game it made, from where it came last time (the admin only)', async () => {
    const kaniel = await api.admin();
    await kaniel('POST', '/api/games/import-foundry', { folder: await foundryWorld() });
    const res = await kaniel('POST', '/api/games/the-lost-keep/reimport-foundry', {});
    expect(res).toMatchObject({ status: 200, json: { report: { scenes: 1, kept: { scenes: [] } } } });
    const ana = await api.joined('test', 'ana');
    expect((await ana('POST', '/api/games/the-lost-keep/reimport-foundry', {})).status).toBe(403);
    const plain = await kaniel('POST', '/api/games/test/reimport-foundry', {});
    expect(plain).toMatchObject({ status: 400, json: { error: expect.stringMatching(/world folder/) as unknown } });
  });

  it('says what is wrong with a folder that is no world', async () => {
    const kaniel = await api.admin();
    const res = await kaniel('POST', '/api/games/import-foundry', { folder: tmpdir() });
    expect(res).toMatchObject({ status: 400, json: { error: expect.stringMatching(/world\.json/) as unknown } });
    expect(api.hub.ids()).toEqual(['test']);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { socketSeat } from './socket-join.ts';
import { startApi, type ApiServer } from './test/api-server.ts';

// Who gets into a game: the GM approving join requests, passwords on the
// home game's fixed seats, and the server's admin password.

let api: ApiServer;

afterEach(async () => {
  await api.close();
});

type Json = Record<string, unknown>;

async function signUp(username: string) {
  const call = api.client();
  await call('POST', '/api/register', { username, password: 'hunter22', name: username.toUpperCase() });
  return call;
}

const req = (url: string) => ({ url, headers: { cookie: '' } }) as never;

describe('join approval', () => {
  it('makes an invite a request the GM approves or turns down', async () => {
    api = await startApi();
    const gm = await signUp('kaniel');
    await gm('POST', '/api/games', { name: 'Lost Mine', system: 'dnd5e', rules: '2014' });
    await gm('PUT', '/api/games/lost-mine/approval', { approval: true });
    const { invite } = (await gm('POST', '/api/games/lost-mine/invite')).json as { invite: string };
    const [bo, cy] = [await signUp('bo'), await signUp('cy')];
    expect((await bo('POST', `/api/invites/${invite}`)).json).toEqual({ game: 'lost-mine', pending: true });
    await cy('POST', `/api/invites/${invite}`);
    expect((await bo('GET', '/api/games/lost-mine')).status).toBe(404);
    const detail = (await gm('GET', '/api/games/lost-mine')).json.game as Json;
    expect(detail).toMatchObject({
      approval: true,
      requests: [
        { id: 'bo', name: 'BO' },
        { id: 'cy', name: 'CY' },
      ],
    });
    expect((await bo('POST', '/api/games/lost-mine/requests/bo', { approve: true })).status).toBe(404);
    await gm('POST', '/api/games/lost-mine/requests/bo', { approve: true });
    await gm('POST', '/api/games/lost-mine/requests/cy', { approve: false });
    const after = (await gm('GET', '/api/games/lost-mine')).json.game as { players: Json[]; requests: Json[] };
    expect(after.players.map((p) => [p.id, p.role])).toEqual([
      ['kaniel', 'gm'],
      ['bo', 'player'],
    ]);
    expect(after.requests).toEqual([]);
  });

  it('seats at once while it is off', async () => {
    api = await startApi();
    const gm = await signUp('kaniel');
    await gm('POST', '/api/games', { name: 'Lost Mine', system: 'dnd5e', rules: '2014' });
    const { invite } = (await gm('POST', '/api/games/lost-mine/invite')).json as { invite: string };
    const bo = await signUp('bo');
    expect((await bo('POST', `/api/invites/${invite}`)).json).toMatchObject({
      game: 'lost-mine',
      player: { id: 'bo' },
    });
  });
});

describe('seat passwords', () => {
  it('lock a fixed seat of the home game until its password is given', async () => {
    api = await startApi();
    const gm = await signUp('kaniel');
    await gm('POST', '/api/games/test/join', {});
    await gm('PUT', '/api/games/test/members/ana/password', { password: 'secret' });
    expect(await socketSeat(req('/ws?player=ana'), api)).toEqual({ refuse: 4003 });
    expect(await socketSeat(req('/ws?player=ana&key=wrong'), api)).toEqual({ refuse: 4003 });
    expect(await socketSeat(req('/ws?player=ana&key=secret'), api)).toMatchObject({ player: { id: 'ana' } });
    const players = ((await gm('GET', '/api/games/test')).json.game as { players: Json[] }).players;
    expect(players.find((p) => p.id === 'ana')).toMatchObject({ locked: true });
    await gm('PUT', '/api/games/test/members/ana/password', { password: null });
    expect(await socketSeat(req('/ws?player=ana'), api)).toMatchObject({ player: { id: 'ana' } });
  });

  it('are the GM’s to set', async () => {
    api = await startApi();
    await signUp('kaniel');
    const bo = await signUp('bo');
    await bo('POST', '/api/games/test/join', {});
    expect((await bo('PUT', '/api/games/test/members/ana/password', { password: 'secret' })).status).toBe(403);
  });
});

describe('the admin password', () => {
  it('makes whoever knows it the server’s admin, instead of the first account', async () => {
    api = await startApi({ adminPassword: 'open sesame' });
    const first = await signUp('kaniel');
    expect((await first('GET', '/api/session')).json.account).toMatchObject({ admin: false });
    expect((await first('POST', '/api/admin', { password: 'nope' })).status).toBe(403);
    expect((await first('POST', '/api/admin', { password: 'open sesame' })).status).toBe(200);
    expect((await first('GET', '/api/session')).json.account).toMatchObject({ admin: true });
  });

  it('is not there unless the server sets one', async () => {
    api = await startApi();
    const first = await signUp('kaniel');
    const bo = await signUp('bo');
    expect((await first('GET', '/api/session')).json).toMatchObject({ account: { admin: true }, adminLock: false });
    expect((await bo('POST', '/api/admin', { password: '' })).status).toBe(403);
  });
});

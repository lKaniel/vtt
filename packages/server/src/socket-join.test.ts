import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { socketSeat } from './socket-join.ts';
import { startApi, type ApiServer } from './test/api-server.ts';

let api: ApiServer;

beforeEach(async () => {
  api = await startApi();
});

afterEach(async () => {
  await api.close();
});

const req = (url: string, cookie = '') => ({ url, headers: { cookie } }) as never;

describe('who a game connection is for', () => {
  it('is the signed-in account, at the game asked for (the home game by default)', async () => {
    const account = await api.accounts.register({ username: 'cy', password: 'hunter22', name: 'Cy' });
    const cookie = `other=1; vtt_session=${await api.accounts.startSession(account.id)}`;
    expect(await socketSeat(req('/ws', cookie), api)).toBeUndefined();
    const id = await api.hub.create(
      { name: 'Lost Mine', system: 'dnd5e', rules: '2014' },
      {
        id: 'cy',
        name: 'Cy',
        role: 'gm',
        color: '#fff',
      },
    );
    expect(await socketSeat(req(`/ws?game=${id}`, cookie), api)).toMatchObject({ game: id, player: { id: 'cy' } });
    expect(api.hub.isRunning(id)).toBe(true);
    expect(await socketSeat(req('/ws?game=nope', cookie), api)).toBeUndefined();
  });

  it('can be a fixed seat of the home game, without an account, but of no other game', async () => {
    expect(await socketSeat(req('/ws?player=ana'), api)).toMatchObject({ game: 'test', player: { id: 'ana' } });
    const id = await api.hub.create(
      { name: 'Lost Mine', system: 'dnd5e', rules: '2014' },
      {
        id: 'gm',
        name: 'GM',
        role: 'gm',
        color: '#fff',
      },
    );
    expect(await socketSeat(req(`/ws?game=${id}&player=gm`), api)).toBeUndefined();
  });
});

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
  it('is the player the browser joined the game as (the home game by default)', async () => {
    const token = await api.sessions.start();
    const cookie = `other=1; vtt_session=${token}`;
    expect(await socketSeat(req('/ws', cookie), api)).toBeUndefined();
    await api.sessions.sit(token, 'test', 'ana');
    expect(await socketSeat(req('/ws', cookie), api)).toMatchObject({ game: 'test', player: { id: 'ana' } });
    const id = await api.hub.create(
      { name: 'Lost Mine', system: 'dnd5e', rules: '2014' },
      { id: 'cy', name: 'Cy', role: 'gm', color: '#fff' },
    );
    expect(await socketSeat(req(`/ws?game=${id}`, cookie), api)).toBeUndefined();
    await api.sessions.sit(token, id, 'cy');
    expect(await socketSeat(req(`/ws?game=${id}`, cookie), api)).toMatchObject({ game: id, player: { id: 'cy' } });
    expect(api.hub.isRunning(id)).toBe(true);
    expect(await socketSeat(req('/ws?game=nope', cookie), api)).toBeUndefined();
  });

  it('is nobody once the player is gone from the game', async () => {
    const token = await api.sessions.start();
    await api.sessions.sit(token, 'test', 'zed');
    expect(await socketSeat(req('/ws', `vtt_session=${token}`), api)).toBeUndefined();
  });
});

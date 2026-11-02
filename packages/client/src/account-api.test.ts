import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './account-api.ts';

function answer(status: number, body: unknown) {
  const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('account api client', () => {
  it('posts JSON and returns the answer', async () => {
    const fetch = answer(200, { account: { id: 'ana', name: 'Ana', admin: false } });
    expect(await api.login('ana', 'pw')).toEqual({ id: 'ana', name: 'Ana', admin: false });
    expect(fetch).toHaveBeenCalledWith('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ana', password: 'pw' }),
    });
  });

  it('throws the server message and issues', async () => {
    answer(400, { error: 'Choose 2 class skills.', issues: ['Choose 2 class skills.'] });
    const err = await api.saveCharacter({ id: '', name: 'x' } as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'Choose 2 class skills.', status: 400, issues: ['Choose 2 class skills.'] });
  });

  it('creates new characters and updates saved ones', async () => {
    const fetch = answer(200, { character: { id: 'vex-1' } });
    await api.saveCharacter({ id: '', name: 'Vex' } as never);
    await api.saveCharacter({ id: 'vex-1', name: 'Vex' } as never);
    expect(fetch.mock.calls.map((c) => [(c as unknown[])[0], ((c as unknown[])[1] as RequestInit).method])).toEqual([
      ['/api/characters', 'POST'],
      ['/api/characters/vex-1', 'PUT'],
    ]);
  });

  it('says the server is unreachable when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(api.session()).rejects.toThrow("Can't reach the game server.");
  });

  it('makes, joins and manages games', async () => {
    const fetch = answer(200, { game: 'lost-mine', invite: 'abc', player: { id: 'ana' } });
    await api.createGame({ name: 'Lost Mine', system: 'dnd5e', rules: '2014' });
    await api.joinGame('lost-mine', 'vex-1');
    await api.newInvite('lost-mine');
    expect(await api.acceptInvite('abc')).toEqual({ game: 'lost-mine' });
    await api.setMember('lost-mine', 'bo', 'trusted');
    await api.setMember('lost-mine', 'bo', null);
    await api.deleteGame('lost-mine');
    expect(fetch.mock.calls.map((c) => [((c as unknown[])[1] as RequestInit).method, (c as unknown[])[0]])).toEqual([
      ['POST', '/api/games'],
      ['POST', '/api/games/lost-mine/join'],
      ['POST', '/api/games/lost-mine/invite'],
      ['POST', '/api/invites/abc'],
      ['PUT', '/api/games/lost-mine/members/bo'],
      ['DELETE', '/api/games/lost-mine/members/bo'],
      ['DELETE', '/api/games/lost-mine'],
    ]);
  });

  it('asks to join, answers requests, locks seats and unlocks the admin', async () => {
    const fetch = answer(200, { game: 'lost-mine', pending: true });
    expect(await api.acceptInvite('abc')).toEqual({ game: 'lost-mine', pending: true });
    await api.setApproval('lost-mine', true);
    await api.answerRequest('lost-mine', 'bo', false);
    await api.setSeatPassword('test', 'ana', 'secret');
    await api.unlockAdmin('open sesame');
    const calls = fetch.mock.calls.map((c) => {
      const init = (c as unknown[])[1] as RequestInit;
      return [(c as unknown[])[0], init.method, init.body];
    });
    expect(calls.slice(1)).toEqual([
      ['/api/games/lost-mine/approval', 'PUT', JSON.stringify({ approval: true })],
      ['/api/games/lost-mine/requests/bo', 'POST', JSON.stringify({ approve: false })],
      ['/api/games/test/members/ana/password', 'PUT', JSON.stringify({ password: 'secret' })],
      ['/api/admin', 'POST', JSON.stringify({ password: 'open sesame' })],
    ]);
  });

  it('lists, makes and restores backups, exports and imports games', async () => {
    const fetch = answer(200, {
      backups: [{ id: 'b1', at: 1, reason: 'load' }],
      backup: { id: 'b2' },
      game: { id: 'x' },
    });
    expect(await api.backups('test')).toEqual([{ id: 'b1', at: 1, reason: 'load' }]);
    expect(await api.backUp('test')).toEqual({ id: 'b2' });
    await api.restoreBackup('test', 'b1');
    expect(api.exportUrl('lost mine')).toBe('/api/games/lost%20mine/export');
    const file = new Blob(['zip']);
    expect(await api.importZip(file)).toEqual({ id: 'x' });
    const calls = fetch.mock.calls.map((c) => [(c as unknown[])[0], ((c as unknown[])[1] as RequestInit).method]);
    expect(calls).toEqual([
      ['/api/games/test/backups', 'GET'],
      ['/api/games/test/backups', 'POST'],
      ['/api/games/test/backups/b1/restore', 'POST'],
      ['/api/games/import-zip', 'POST'],
    ]);
    expect(((fetch.mock.calls[3] as unknown[])[1] as RequestInit).body).toBe(file);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './server-api.ts';

function answer(status: number, body: unknown) {
  const fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('server api client', () => {
  it('posts JSON and returns the answer', async () => {
    const fetch = answer(200, { player: { id: 'ana', name: 'Ana', role: 'player' } });
    expect(await api.join('lost-mine', 'ana', 'pw')).toEqual({ id: 'ana', name: 'Ana', role: 'player' });
    expect(fetch).toHaveBeenCalledWith('/api/games/lost-mine/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ player: 'ana', password: 'pw' }),
    });
  });

  it('throws the server message and issues', async () => {
    answer(400, { error: 'Choose 2 class skills.', issues: ['Choose 2 class skills.'] });
    const err = await api.saveCharacter('test', { id: '', name: 'x' } as never).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: 'Choose 2 class skills.', status: 400, issues: ['Choose 2 class skills.'] });
  });

  it('creates new characters and updates saved ones', async () => {
    const fetch = answer(200, { character: { id: 'vex-1' } });
    await api.saveCharacter('test', { id: '', name: 'Vex', owner: 'ana', game: 'test' } as never);
    await api.saveCharacter('test', { id: 'vex-1', name: 'Vex' } as never);
    await api.bring('test', 'vex-1');
    const calls = fetch.mock.calls.map((c) => [(c as unknown[])[0], (c as unknown[])[1] as RequestInit]);
    expect(calls.map(([path, init]) => [path, (init as RequestInit).method])).toEqual([
      ['/api/games/test/characters', 'POST'],
      ['/api/games/test/characters/vex-1', 'PUT'],
      ['/api/games/test/bring', 'POST'],
    ]);
    expect((calls[0]![1] as RequestInit).body).toBe(JSON.stringify({ name: 'Vex' }));
  });

  it('says the server is unreachable when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    await expect(api.session()).rejects.toThrow("Can't reach the game server.");
  });

  it('makes games and manages their players', async () => {
    const fetch = answer(200, { game: { id: 'lost-mine' }, player: { id: 'cy' } });
    await api.createGame({ name: 'Lost Mine', system: 'dnd5e', rules: '2014' });
    await api.addPlayer('lost-mine', { name: 'Cy', role: 'player', password: 'pw' });
    await api.setRole('lost-mine', 'cy', 'trusted');
    await api.setPassword('lost-mine', 'cy', null);
    await api.removePlayer('lost-mine', 'cy');
    await api.leave('lost-mine');
    await api.deleteGame('lost-mine');
    const calls = fetch.mock.calls.map((c) => {
      const init = (c as unknown[])[1] as RequestInit;
      return [init.method, (c as unknown[])[0], init.body];
    });
    expect(calls).toEqual([
      ['POST', '/api/games', JSON.stringify({ name: 'Lost Mine', system: 'dnd5e', rules: '2014' })],
      ['POST', '/api/games/lost-mine/players', JSON.stringify({ name: 'Cy', role: 'player', password: 'pw' })],
      ['PUT', '/api/games/lost-mine/players/cy', JSON.stringify({ role: 'trusted' })],
      ['PUT', '/api/games/lost-mine/players/cy/password', JSON.stringify({ password: null })],
      ['DELETE', '/api/games/lost-mine/players/cy', undefined],
      ['POST', '/api/games/lost-mine/leave', '{}'],
      ['DELETE', '/api/games/lost-mine', undefined],
    ]);
  });

  it('opens, locks and sets the admin password', async () => {
    const fetch = answer(200, {});
    await api.unlockAdmin('open sesame');
    await api.setAdminPassword('castle');
    await api.lockAdmin();
    const calls = fetch.mock.calls.map((c) => {
      const init = (c as unknown[])[1] as RequestInit;
      return [(c as unknown[])[0], init.method, init.body];
    });
    expect(calls).toEqual([
      ['/api/admin', 'POST', JSON.stringify({ password: 'open sesame' })],
      ['/api/admin', 'PUT', JSON.stringify({ password: 'castle' })],
      ['/api/admin', 'DELETE', undefined],
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

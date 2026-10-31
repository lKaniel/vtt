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
});

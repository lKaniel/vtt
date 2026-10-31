import type { Character, Edition, Player } from '@vtt/shared';

// The account side of the server: signing in, characters, and taking a seat.

export interface Account {
  id: string;
  name: string;
  admin: boolean;
}

export interface SessionInfo {
  account: Account | null;
  world: { name: string; rules: Edition };
  /** The account's seat at the world, once it has joined. */
  seat: Player | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init).catch(() => {
    throw new ApiError("Can't reach the game server. Is it running?", 0);
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; issues?: string[] };
  if (!res.ok) throw new ApiError(data.error ?? res.statusText, res.status, data.issues);
  return data;
}

export const api = {
  session: () => call<SessionInfo>('GET', '/api/session'),
  login: async (username: string, password: string) =>
    (await call<{ account: Account }>('POST', '/api/login', { username, password })).account,
  register: async (username: string, password: string, name: string) =>
    (await call<{ account: Account }>('POST', '/api/register', { username, password, name })).account,
  logout: () => call<object>('POST', '/api/logout', {}),
  characters: async () => (await call<{ characters: Character[] }>('GET', '/api/characters')).characters,
  /** Creates the character when `id` is empty, else updates it. */
  saveCharacter: async ({ id, owner: _owner, ...rest }: Character) =>
    (await call<{ character: Character }>(id ? 'PUT' : 'POST', id ? `/api/characters/${id}` : '/api/characters', rest))
      .character,
  deleteCharacter: (id: string) => call<object>('DELETE', `/api/characters/${id}`),
  join: async (character?: string) => (await call<{ player: Player }>('POST', '/api/join', { character })).player,
};

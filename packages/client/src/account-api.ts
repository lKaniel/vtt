import type { Character } from '@vtt/system-dnd5e';
import type { GameDetail, GameSummary, NewGame, Player, Role } from '@vtt/shared';
import type { SystemInfo } from '@vtt/core';

// The account side of the server: signing in, characters, and the lobby.

export interface Account {
  id: string;
  name: string;
  admin: boolean;
}

export interface SessionInfo {
  account: Account | null;
  /** The game the server was started with. */
  home: { id: string; name: string; rules: string } | null;
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

const game = (id: string, rest = '') => `/api/games/${encodeURIComponent(id)}${rest}`;

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

  games: () => call<{ games: GameSummary[]; systems: SystemInfo[] }>('GET', '/api/games'),
  game: async (id: string) => (await call<{ game: GameDetail }>('GET', game(id))).game,
  createGame: async (input: NewGame) => (await call<{ game: GameSummary }>('POST', '/api/games', input)).game,
  deleteGame: (id: string) => call<object>('DELETE', game(id)),
  /** Takes your seat at the game, bringing `character` from your roster. */
  joinGame: async (id: string, character?: string) =>
    (await call<{ player: Player }>('POST', game(id, '/join'), { character })).player,
  /** A new invite code; the old link stops working. */
  newInvite: async (id: string) => (await call<{ invite: string }>('POST', game(id, '/invite'), {})).invite,
  /** Joins by an invite code, answering the game's id. */
  acceptInvite: async (code: string) =>
    (await call<{ game: string }>('POST', `/api/invites/${encodeURIComponent(code)}`, {})).game,
  setOpen: (id: string, open: boolean) => call<object>('PUT', game(id, '/open'), { open }),
  /** Changes a member's role, or removes them (null). */
  setMember: (id: string, member: string, role: Role | null) =>
    role
      ? call<object>('PUT', game(id, `/members/${member}`), { role })
      : call<object>('DELETE', game(id, `/members/${member}`)),
};

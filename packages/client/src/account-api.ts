import type { Character } from '@vtt/system-dnd5e';
import type {
  FoundryImportInput,
  FoundryImportReport,
  GameDetail,
  GameSummary,
  NewGame,
  Player,
  Role,
} from '@vtt/shared';
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
  /** Becoming admin takes the server's admin password. */
  adminLock?: boolean;
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
  /** Makes a game from a Foundry world folder on the server's disk (the admin only). */
  importFoundry: (input: FoundryImportInput) =>
    call<{ game: GameSummary; report: FoundryImportReport }>('POST', '/api/games/import-foundry', input),
  /** Takes your seat at the game, bringing `character` from your roster; `pending` when the GM approves joins first. */
  joinGame: (id: string, character?: string) =>
    call<{ player?: Player; pending?: boolean }>('POST', game(id, '/join'), { character }),
  /** A new invite code; the old link stops working. */
  newInvite: async (id: string) => (await call<{ invite: string }>('POST', game(id, '/invite'), {})).invite,
  /** Joins by an invite code: the game's id, and `pending` when the GM approves joins first. */
  acceptInvite: async (code: string) => {
    const { game: id, pending } = await call<{ game: string; pending?: boolean }>(
      'POST',
      `/api/invites/${encodeURIComponent(code)}`,
      {},
    );
    return pending ? { game: id, pending } : { game: id };
  },
  /** GM: joining asks you first, or not. */
  setApproval: (id: string, approval: boolean) => call<object>('PUT', game(id, '/approval'), { approval }),
  /** GM: lets an account that asked in, or turns it down. */
  answerRequest: (id: string, account: string, approve: boolean) =>
    call<object>('POST', game(id, `/requests/${encodeURIComponent(account)}`), { approve }),
  /** GM: a password on a seat taken without an account, or none (null). */
  setSeatPassword: (id: string, seat: string, password: string | null) =>
    call<object>('PUT', game(id, `/members/${encodeURIComponent(seat)}/password`), { password }),
  /** Become the server's admin with its admin password. */
  unlockAdmin: (password: string) => call<{ account: Account }>('POST', '/api/admin', { password }),
  setOpen: (id: string, open: boolean) => call<object>('PUT', game(id, '/open'), { open }),
  /** Changes a member's role, or removes them (null). */
  setMember: (id: string, member: string, role: Role | null) =>
    role
      ? call<object>('PUT', game(id, `/members/${member}`), { role })
      : call<object>('DELETE', game(id, `/members/${member}`)),
};

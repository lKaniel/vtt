import type { Character, Class } from '@vtt/system-dnd5e';
import type {
  BackupInfo,
  BaileywikiImportReport,
  BaileywikiScene,
  BaileywikiStatus,
  FoundryImportInput,
  FoundryImportReport,
  FoundryReimportInput,
  GameDetail,
  GameSummary,
  NewGame,
  OffsiteNight,
  OffsiteStatus,
  Player,
  Role,
} from '@vtt/shared';
import type { PackManifest, SystemInfo } from '@vtt/core';

// The server's HTTP side: the admin password (Setup), the games and their
// players (joining one as a player, Foundry style), and each player's
// characters there.

export interface SessionInfo {
  /** This browser may use Setup: it gave the admin password, or the server has none. */
  admin: boolean;
  /** The server has an admin password. */
  adminPassword: boolean;
  /** The admin password is set on the server (VTT_ADMIN_PASSWORD), so Setup can't change it. */
  adminFixed?: boolean;
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

/** A Baileywiki route, for a game's GM when `game` is given. */
const bw = (path: string, game?: string) =>
  game ? `/api/baileywiki${path}?game=${encodeURIComponent(game)}` : `/api/baileywiki${path}`;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body instanceof Blob) {
    init.headers = { 'content-type': 'application/zip' };
    init.body = body;
  } else if (body !== undefined) {
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

const packPath = (id: string) => `/api/packs/${encodeURIComponent(id)}`;

const game = (id: string, rest = '') => `/api/games/${encodeURIComponent(id)}${rest}`;

export const api = {
  session: () => call<SessionInfo>('GET', '/api/session'),
  /** Opens Setup with the admin password. */
  unlockAdmin: (password: string) => call<object>('POST', '/api/admin', { password }),
  /** Admin: a new admin password, or none (null: Setup open to anyone). */
  setAdminPassword: (password: string | null) => call<object>('PUT', '/api/admin', { password }),
  /** Closes Setup on this browser. */
  lockAdmin: () => call<object>('DELETE', '/api/admin'),

  games: () => call<{ games: GameSummary[]; systems: SystemInfo[] }>('GET', '/api/games'),
  game: async (id: string) => (await call<{ game: GameDetail }>('GET', game(id))).game,
  /** Joins the game as `player`, with its password if it has one. */
  join: async (id: string, player: string, password = '') =>
    (await call<{ player: Player }>('POST', game(id, '/join'), { player, password })).player,
  /** Forgets the player this browser joined the game as. */
  leave: (id: string) => call<object>('POST', game(id, '/leave'), {}),

  /** Admin: a new game, joined as its Gamemaster. */
  createGame: async (input: NewGame) => (await call<{ game: GameSummary }>('POST', '/api/games', input)).game,
  /** Admin: deletes a game, files and all. */
  deleteGame: (id: string) => call<object>('DELETE', game(id)),
  /** Admin: makes a game from a Foundry world folder on the server's disk. */
  importFoundry: (input: FoundryImportInput) =>
    call<{ game: GameSummary; report: FoundryImportReport }>('POST', '/api/games/import-foundry', input),
  /** Admin: imports the Foundry world a game came from again into it, keeping what was made in the VTT. */
  reimportFoundry: (id: string, input: FoundryReimportInput) =>
    call<{ report: FoundryImportReport }>('POST', `/api/games/${encodeURIComponent(id)}/reimport-foundry`, input),
  /** Admin (or, with `game`, that game's GM): the server's Baileywiki sign-in. */
  baileywiki: (game?: string) => call<BaileywikiStatus>('GET', bw('', game)),
  /** Signs the server in to Baileywiki with the code their site shows. */
  baileywikiSignIn: (code: string, game?: string) => call<BaileywikiStatus>('POST', bw('/sign-in', game), { code }),
  baileywikiSignOut: (game?: string) => call<BaileywikiStatus>('DELETE', bw('', game)),
  /** The scenes in Baileywiki's online compendia. */
  baileywikiScenes: async (game?: string) =>
    (await call<{ scenes: BaileywikiScene[] }>('GET', bw('/scenes', game))).scenes,
  /** Downloads picked scenes into the server's Baileywiki pack; hands them back for a game to add. */
  baileywikiImport: (scenes: { compendium: string; id: string }[], game?: string) =>
    call<BaileywikiImportReport>('POST', bw('/import', game), { scenes }),
  /** Admin: a new game from an exported zip. */
  importZip: async (file: Blob) => (await call<{ game: GameSummary }>('POST', '/api/games/import-zip', file)).game,

  /** GM: a new player at the game. */
  addPlayer: async (id: string, input: { name: string; role: Role; password?: string }) =>
    (await call<{ player: Player }>('POST', game(id, '/players'), input)).player,
  /** GM: a player's role. */
  setRole: (id: string, player: string, role: Role) =>
    call<object>('PUT', game(id, `/players/${encodeURIComponent(player)}`), { role }),
  /** GM: removes a player (their characters stay as actors). */
  removePlayer: (id: string, player: string) =>
    call<object>('DELETE', game(id, `/players/${encodeURIComponent(player)}`)),
  /** GM, or yourself: a player's password, or none (null). */
  setPassword: (id: string, player: string, password: string | null) =>
    call<object>('PUT', game(id, `/players/${encodeURIComponent(player)}/password`), { password }),

  /** Your characters at the game. */
  characters: async (id: string) =>
    (await call<{ characters: Character[] }>('GET', game(id, '/characters'))).characters,
  /** Creates the character when its `id` is empty, else updates it. */
  saveCharacter: async (id: string, { id: cid, owner: _owner, game: _game, ...rest }: Character) =>
    (
      await call<{ character: Character }>(
        cid ? 'PUT' : 'POST',
        game(id, cid ? `/characters/${cid}` : '/characters'),
        rest,
      )
    ).character,
  deleteCharacter: (id: string, cid: string) => call<object>('DELETE', game(id, `/characters/${cid}`)),
  /** Brings your character onto the map (or updates it there). */
  bring: (id: string, character: string) => call<object>('POST', game(id, '/bring'), { character }),
  /** The GM's homebrew classes you may build a character with at the game. */
  homebrew: async (id: string) => (await call<{ classes: Class[] }>('GET', game(id, '/homebrew'))).classes,
  /** Whether you have a key for Claude at the game (claude-bridge.ts). */
  hasMcpKey: async (id: string) => (await call<{ has: boolean }>('GET', game(id, '/mcp-key'))).has,
  /** A new key for Claude, replacing the old one; the server shows it only now. */
  newMcpKey: async (id: string) => (await call<{ key: string }>('POST', game(id, '/mcp-key'), {})).key,
  dropMcpKey: (id: string) => call<object>('DELETE', game(id, '/mcp-key')),

  /** GM: the game's backups, newest first. */
  backups: async (id: string) => (await call<{ backups: BackupInfo[] }>('GET', game(id, '/backups'))).backups,
  /** GM: backs the game up now. */
  backUp: async (id: string) => (await call<{ backup: BackupInfo }>('POST', game(id, '/backups'))).backup,
  /** GM: puts a backup back (the game as it is now is backed up first). */
  restoreBackup: (id: string, backup: string) =>
    call<object>('POST', game(id, `/backups/${encodeURIComponent(backup)}/restore`)),
  /** GM: where the game downloads as a zip. */
  exportUrl: (id: string) => game(id, '/export'),

  /** Admin: the nightly backups off the server, and where they go. */
  offsite: () => call<{ status: OffsiteStatus; nights: OffsiteNight[] }>('GET', '/api/offsite'),
  /** Admin: makes tonight's off-server backup now. */
  offsiteNow: async () => (await call<{ night: OffsiteNight }>('POST', '/api/offsite')).night,
  /** Admin: puts a game back as it was on `night`. */
  offsiteRestore: (night: string, id: string) =>
    call<object>('POST', `/api/offsite/${encodeURIComponent(night)}/${encodeURIComponent(id)}/restore`),
  /** Admin: the installed packs, and uploads not finished. */
  packs: () => call<{ packs: PackManifest[]; pending: string[] }>('GET', '/api/packs'),
  /** Admin: starts (or goes on with) uploading a pack; the files already up. */
  beginPack: (manifest: unknown) =>
    call<{ id: string; have: Record<string, number> }>('POST', '/api/packs/upload', manifest),
  /** Admin: one file of a pack being uploaded. */
  putPackFile: (id: string, path: string, file: File) =>
    call<object>('PUT', `${packPath(id)}/files/${path.split('/').map(encodeURIComponent).join('/')}`, file),
  /** Admin: installs the uploaded pack. */
  finishPack: (id: string) => call<{ pack: PackManifest }>('POST', `${packPath(id)}/finish`),
  /** Admin: calls an upload off. */
  cancelPack: (id: string) => call<object>('DELETE', `${packPath(id)}/upload`),
  /** Admin: deletes an installed pack. */
  deletePack: (id: string) => call<object>('DELETE', packPath(id)),
};

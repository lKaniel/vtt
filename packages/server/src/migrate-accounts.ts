import { access, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { CharacterStore } from './characters.ts';
import type { GameHub, GameInfo } from './game-hub.ts';
import { readJson, readJsonDir, writeJson } from './json-files.ts';

// Servers from before games had their own players kept accounts: an account
// was a seat (same id) in each game it joined, with one password, and the
// first account was the admin. This carries them over once, on start:
//
// - the admin account's password becomes the admin password (Setup);
// - each account's password becomes its player's password in every game it
//   sat in, and its Claude key that player's key (the home game's, else its
//   first game's);
// - signed-in browsers stay signed in, as those players (and admin);
// - roster characters move into the game whose map has them, else the
//   owner's home or first game.
//
// The old accounts/ folder is then renamed accounts-old/, so it runs once.

const OldAccount = z.object({
  id: z.string(),
  salt: z.string(),
  hash: z.string(),
  admin: z.boolean().default(false),
  mcpKey: z.string().optional(),
});
type OldAccount = z.infer<typeof OldAccount>;
const OldSession = z.object({ account: z.string(), expires: z.number() });

interface Deps {
  dataDir: string;
  hub: GameHub;
  characters: CharacterStore;
}

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

/** Carries old accounts over to players, if the data folder still has them; true if it did. */
export async function migrateAccounts(deps: Deps): Promise<boolean> {
  const dir = join(deps.dataDir, 'accounts');
  const accounts = (await readJsonDir(dir)).flatMap((raw) => {
    const parsed = OldAccount.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  if (!accounts.length) return false;
  const games = await Promise.all(deps.hub.ids().map((id) => deps.hub.info(id)));
  await adminPassword(deps.dataDir, accounts);
  for (const account of accounts) await seats(deps.hub, games, account);
  await sessions(deps.dataDir, games, accounts);
  await characters(deps, games);
  await rename(dir, join(deps.dataDir, 'accounts-old'));
  return true;
}

async function adminPassword(dataDir: string, accounts: OldAccount[]): Promise<void> {
  const admin = accounts.find((a) => a.admin);
  const path = join(dataDir, 'admin.json');
  if (admin && !(await exists(path))) await writeJson(path, { salt: admin.salt, hash: admin.hash });
}

const seatedIn = (games: GameInfo[], id: string) => games.filter((g) => g.players.some((p) => p.id === id));

/** The game an account's things go to: the home game if it sat there, else its first. */
const mainGame = (games: GameInfo[], id: string) => {
  const mine = seatedIn(games, id);
  return mine.find((g) => g.home) ?? mine[0];
};

async function seats(hub: GameHub, games: GameInfo[], account: OldAccount): Promise<void> {
  const hashed = { salt: account.salt, hash: account.hash };
  for (const game of seatedIn(games, account.id)) await hub.access.adoptPassword(game.id, account.id, hashed);
  const main = mainGame(games, account.id);
  if (account.mcpKey && main) await hub.access.adoptMcpKey(main.id, account.id, account.mcpKey);
}

async function sessions(dataDir: string, games: GameInfo[], accounts: OldAccount[]): Promise<void> {
  const path = join(dataDir, 'sessions.json');
  const old = z.record(z.string(), z.unknown()).safeParse(await readJson(path));
  if (!old.success) return;
  const next = Object.entries(old.data).flatMap(([token, value]) => {
    const s = OldSession.safeParse(value);
    if (!s.success) return [[token, value]];
    const account = accounts.find((a) => a.id === s.data.account);
    const mine = Object.fromEntries(seatedIn(games, s.data.account).map((g) => [g.id, s.data.account]));
    return [[token, { admin: !!account?.admin, seats: mine, expires: s.data.expires }]];
  });
  await writeJson(path, Object.fromEntries(next));
}

async function characters({ hub, characters: store }: Deps, games: GameInfo[]): Promise<void> {
  for (const c of store.all().filter((x) => !x.game)) {
    const onMap = await findAsync(games, (g) => exists(join(hub.dirOf(g.id) ?? '', 'actors', `${c.id}.json`)));
    const game = onMap ?? mainGame(games, c.owner);
    if (game) await store.save({ ...c, game: game.id });
  }
}

async function findAsync<T>(list: T[], test: (x: T) => Promise<boolean>): Promise<T | undefined> {
  for (const x of list) if (await test(x)) return x;
  return undefined;
}

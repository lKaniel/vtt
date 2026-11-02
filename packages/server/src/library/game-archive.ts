import { join } from 'node:path';
import { type Game as GameFile, GameSchema, isGm, type Player, PlayerSchema } from '@vtt/shared';
import { z } from 'zod';
import { readFolder, writeFolder } from '../store/folder-files.ts';
import { writeJson } from '../store/json-files.ts';
import { unzip, zip, type ZipEntry } from './zip.ts';

// A whole game folder as one zip file: what the GM downloads to keep or
// move a game, and what the lobby turns back into a new game.

/** Biggest zip the lobby takes in, and the most it may unpack to. */
export const MAX_ZIP = 512 * 1024 ** 2;
const MAX_UNPACKED = 2 * 1024 ** 3;

/** Thrown for a zip that isn't a game, with the reason to show. */
export class ArchiveError extends Error {}

/** The game folder `dir` as a zip, pictures and all. */
export async function zipGame(dir: string): Promise<Buffer> {
  return zip(await readFolder(dir));
}

/** game.json as the zip has it: its id and seats are replaced on import. */
/** A zipped game's players may be none: whoever imports it adds a GM. */
const ZippedGameSchema = GameSchema.omit({ id: true }).extend({ players: z.array(PlayerSchema).default([]) });

export interface ZippedGame {
  game: Omit<GameFile, 'id'>;
  /** Every file but game.json, relative to the game's folder. */
  files: ZipEntry[];
}

/** The game in a zip: game.json at its root, or in one folder inside it. */
export function unzipGame(buf: Buffer): ZippedGame {
  let entries: ZipEntry[];
  try {
    entries = unzip(buf, { maxBytes: MAX_UNPACKED });
  } catch (e) {
    throw new ArchiveError((e as Error).message);
  }
  const top = entries
    .filter((f) => /^([^/]+\/)?game\.json$/.test(f.path))
    .sort((a, b) => a.path.length - b.path.length)[0];
  if (!top) throw new ArchiveError('There is no game.json in this zip: export a game from its page.');
  const parsed = ZippedGameSchema.safeParse(parseJson(top.data));
  if (!parsed.success) throw new ArchiveError('The game.json in this zip is not a game file.');
  const root = top.path.slice(0, -'game.json'.length);
  const files = entries
    .filter((f) => f.path.startsWith(root) && f.path !== top.path)
    .map((f) => ({ path: f.path.slice(root.length), data: f.data }));
  return { game: parsed.data, files };
}

function parseJson(data: Buffer): unknown {
  try {
    return JSON.parse(data.toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
}

/** Writes an unzipped game into `dir` as game `id`, keeping its players (their passwords stay behind); `gm` joins them if it has no GM. */
export async function writeGame(dir: string, { game, files }: ZippedGame, id: string, gm: Player): Promise<void> {
  await writeFolder(dir, files);
  const players = game.players.some(isGm) ? game.players : [gm, ...game.players.filter((p) => p.id !== gm.id)];
  await writeJson(join(dir, 'game.json'), { ...game, id, players });
}

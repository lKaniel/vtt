import { join } from 'node:path';
import { writeJson } from './json-files.ts';
import { backUp, formatOf, isObject, readActors, readTokenFiles } from './migrate-files.ts';

// Game format 4 replaces a creature's `controllers` and `observers` lists
// with Foundry-style ownership levels: { default: "limited", ana: "owner" }.
// Actors, tokens that carry their own sheet, and unlinked tokens' deltas
// all change; everything else is left as written.

/** The newest game folder format. */
export const FORMAT = 4;

type Raw = Record<string, unknown>;

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The ownership two old lists stand for, or undefined when both are empty. Owner wins over observer. */
function levels(controllers: unknown, observers: unknown): Raw | undefined {
  const out: Raw = { default: 'limited' };
  for (const id of ids(observers)) out[id] = 'observer';
  for (const id of ids(controllers)) out[id] = 'owner';
  return Object.keys(out).length > 1 ? out : undefined;
}

/** A sheet (actor or token) with ownership in place of controllers and observers. */
export function ownedSheet<T extends Raw>(sheet: T): T {
  if (!('controllers' in sheet) && !('observers' in sheet)) return sheet;
  const { controllers, observers, ...rest } = sheet;
  const ownership = levels(controllers, observers);
  return (ownership ? { ...rest, ownership } : rest) as unknown as T;
}

/** An unlinked token's delta: the lists it overrides, read on top of its actor's. */
function ownedDelta(delta: Raw, actor: Raw | undefined): Raw {
  if (!('controllers' in delta) && !('observers' in delta)) return delta;
  const { controllers, observers, ...rest } = delta;
  const pick = (key: string, own: unknown) => (key in delta ? own : actor?.[key]);
  const ownership = levels(pick('controllers', controllers), pick('observers', observers));
  return { ...rest, ownership: ownership ?? null };
}

function ownedToken(raw: unknown, actors: ReadonlyMap<string, unknown>): unknown {
  if (!isObject(raw)) return raw;
  const token = ownedSheet(raw);
  if (!isObject(token.delta)) return token;
  const actor = typeof token.actor === 'string' ? actors.get(token.actor) : undefined;
  const delta = ownedDelta(token.delta, isObject(actor) ? actor : undefined);
  return delta === token.delta ? token : { ...token, delta };
}

/**
 * Moves a game folder to format 4 in place. Returns null when it is already
 * there (or has no game.json, or is older than format 3: migrate those
 * first). Copies the files to `.v3-backup/<time>/` and writes game.json
 * last, so a move cut short is redone on the next start.
 */
export async function migrateOwnershipFolder(
  dir: string,
  { now = new Date() } = {},
): Promise<{ backup: string } | null> {
  const found = await formatOf(dir);
  if (!found || found.format >= FORMAT || found.format < FORMAT - 1) return null;
  const actors = await readActors(dir);
  const tokens = await readTokenFiles(dir);
  const backup = await backUp(dir, 'v3', now);
  for (const [rel, list] of tokens) {
    const next = list.map((t) => ownedToken(t, actors));
    if (next.some((t, i) => t !== list[i])) await writeJson(join(dir, rel), next);
  }
  for (const [id, actor] of actors) {
    const next = isObject(actor) ? ownedSheet(actor) : actor;
    if (next !== actor) await writeJson(join(dir, `actors/${id}.json`), next);
  }
  await writeJson(join(dir, 'game.json'), { ...found.game, format: FORMAT });
  return { backup };
}

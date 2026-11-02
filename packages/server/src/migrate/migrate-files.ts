import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Reading a game folder's raw JSON for the format moves (migrate-actors.ts,
// migrate-ownership.ts), which work on the files as written so no defaults
// are filled in.

export function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export async function readJsonFile(dir: string, rel: string): Promise<unknown> {
  const text = await readFile(join(dir, rel), 'utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(`${rel} can't be migrated: ${(e as Error).message}`, { cause: e });
  }
}

export async function names(dir: string, sub: string): Promise<string[]> {
  return readdir(join(dir, sub)).catch(() => [] as string[]);
}

/** Every actors/<id>.json, by id; one that can't be read is undefined. */
export async function readActors(dir: string): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  for (const name of (await names(dir, 'actors')).filter((n) => n.endsWith('.json'))) {
    const data = await readJsonFile(dir, `actors/${name}`).catch(() => undefined);
    out.set(name.slice(0, -'.json'.length), data);
  }
  return out;
}

/** Each scene's tokens.json, by path. */
export async function readTokenFiles(dir: string): Promise<Map<string, unknown[]>> {
  const out = new Map<string, unknown[]>();
  for (const scene of await names(dir, 'scenes')) {
    const rel = `scenes/${scene}/tokens.json`;
    if (!(await names(dir, `scenes/${scene}`)).includes('tokens.json')) continue;
    const data = await readJsonFile(dir, rel);
    if (!Array.isArray(data)) throw new Error(`${rel} can't be migrated to the new game format: it isn't a list`);
    out.set(rel, data);
  }
  return out;
}

/** The game format a folder is in (0 before formats were numbered), or undefined without a game.json. */
export async function formatOf(dir: string): Promise<{ game: Record<string, unknown>; format: number } | undefined> {
  if (!(await names(dir, '.')).includes('game.json')) return undefined;
  const game = await readJsonFile(dir, 'game.json');
  if (!isObject(game)) return undefined;
  return { game, format: typeof game.format === 'number' ? game.format : 0 };
}

/** Copies game.json, actors/ and scenes/ to `.<tag>-backup/<time>/` and returns that path. */
export async function backUp(dir: string, tag: string, now: Date): Promise<string> {
  const backup = `.${tag}-backup/${now
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(':', '-')}`;
  await mkdir(join(dir, backup), { recursive: true });
  for (const name of ['game.json', 'actors', 'scenes']) {
    await cp(join(dir, name), join(dir, backup, name), { recursive: true }).catch(() => undefined);
  }
  return backup;
}

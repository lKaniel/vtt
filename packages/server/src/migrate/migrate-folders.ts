import { freeId, keysBetween, slugify } from '@vtt/core';
import { type FolderKind, FOLDERS } from '@vtt/shared';
import { join } from 'node:path';
import { writeJson } from '../store/json-files.ts';
import { backUp, formatOf, isObject, names, readJsonFile } from './migrate-files.ts';

// Game format 5 gives the sidebar lists real folders (folders.ts in shared):
// a document's `folder` was a name ("Road ambush", or "Monsters / Goblins"
// for one inside another) and is now the id of a folders/<id>.json, one per
// list and name, nested as the names were.

/** The newest game folder format. */
export const FORMAT = 5;

type Raw = Record<string, unknown>;

/** The files of each list that may name a folder, relative to the game folder. */
async function listFiles(dir: string): Promise<{ kind: FolderKind; rel: string }[]> {
  const out: { kind: FolderKind; rel: string }[] = [];
  for (const kind of ['actors', 'journals', 'tables', 'playlists', 'macros', 'cards'] as const) {
    for (const name of (await names(dir, kind)).filter((n) => n.endsWith('.json')))
      out.push({ kind, rel: `${kind}/${name}` });
  }
  for (const scene of await names(dir, 'scenes')) {
    if ((await names(dir, `scenes/${scene}`)).includes('scene.json'))
      out.push({ kind: 'scenes', rel: `scenes/${scene}/scene.json` });
  }
  return out;
}

/** Makes the folders the old names stand for, as they are asked for. */
class FolderMaker {
  readonly made = new Map<string, Raw>();
  private byPath = new Map<string, string>();

  constructor(private taken: Set<string>) {}

  /** The id of the folder at `path` ("A / B") in list `kind`, made with its parents if new. */
  idOf(kind: FolderKind, path: string): string {
    let parent: string | undefined;
    let at = '';
    for (const name of path
      .split(' / ')
      .map((n) => n.trim())
      .filter(Boolean)) {
      at = at ? `${at} / ${name}` : name;
      parent = this.step(kind, at, name, parent);
    }
    return parent ?? this.step(kind, path, path, undefined);
  }

  private step(kind: FolderKind, path: string, name: string, parent: string | undefined): string {
    const key = `${kind}\u0000${path}`;
    const known = this.byPath.get(key);
    if (known) return known;
    const id = freeId(slugify(name), (x) => this.taken.has(x), { bare: true });
    this.taken.add(id);
    this.byPath.set(key, id);
    this.made.set(id, { id, name, kind, ...(parent ? { parent } : {}) });
    return id;
  }

  /** The folders, each list's in name order. */
  sorted(): Raw[] {
    const list = [...this.made.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const keys = keysBetween(null, null, list.length);
    return list.map((f, i) => ({ ...f, sort: keys[i] }));
  }
}

/** The documents that name a folder that isn't one of their list's, read from disk. */
async function filed(dir: string, existing: Map<string, Raw>) {
  const out: { kind: FolderKind; rel: string; data: Raw; folder: string }[] = [];
  for (const { kind, rel } of await listFiles(dir)) {
    const data = await readJsonFile(dir, rel).catch(() => undefined);
    if (!isObject(data) || typeof data.folder !== 'string' || !data.folder) continue;
    if (existing.get(data.folder)?.kind === kind) continue;
    out.push({ kind, rel, data, folder: data.folder });
  }
  return out;
}

async function readFolders(dir: string): Promise<Map<string, Raw>> {
  const out = new Map<string, Raw>();
  for (const name of (await names(dir, FOLDERS)).filter((n) => n.endsWith('.json'))) {
    const data = await readJsonFile(dir, `${FOLDERS}/${name}`).catch(() => undefined);
    if (isObject(data)) out.set(name.slice(0, -'.json'.length), data);
  }
  return out;
}

/**
 * Moves a game folder to format 5 in place. Returns null when it is already
 * there (or has no game.json, or is older than format 4). Copies what it
 * changes to `.v4-backup/<time>/` first and writes game.json last.
 */
export async function migrateFoldersFolder(
  dir: string,
  { now = new Date() } = {},
): Promise<{ backup?: string; folders: number } | null> {
  const found = await formatOf(dir);
  if (!found || found.format >= FORMAT || found.format < FORMAT - 1) return null;
  const existing = await readFolders(dir);
  const docs = await filed(dir, existing);
  const maker = new FolderMaker(new Set(existing.keys()));
  const moved = docs.map((d) => ({ ...d, data: { ...d.data, folder: maker.idOf(d.kind, d.folder) } }));
  const backup = moved.length
    ? await backUp(dir, 'v4', now, ['journals', 'tables', 'playlists', 'macros', 'cards'])
    : undefined;
  for (const f of maker.sorted()) await writeJson(join(dir, FOLDERS, `${String(f.id)}.json`), f);
  for (const d of moved) await writeJson(join(dir, d.rel), d.data);
  await writeJson(join(dir, 'game.json'), { ...found.game, format: FORMAT });
  return { ...(backup ? { backup } : {}), folders: maker.made.size };
}

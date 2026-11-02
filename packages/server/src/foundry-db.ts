import { readFile, stat } from 'node:fs/promises';
import { readLevelDb } from './leveldb.ts';

// Foundry VTT's databases: one per world collection (data/actors, data/scenes,
// ...) and per compendium. Up to v10 each is a NeDB file (one JSON document
// per line); from v11 a LevelDB folder whose keys are `!<collection>!<id>`,
// with embedded documents (a scene's tokens, an actor's items) under their
// own keys, `!scenes.tokens!<scene id>.<token id>`, and only their ids in the
// parent. Either way we hand back whole documents, embedded ones in place.

export type FoundryDoc = Record<string, unknown>;

/** The live documents of a NeDB file (later lines replace earlier ones). */
async function readNedb(path: string): Promise<FoundryDoc[]> {
  const byId = new Map<string, FoundryDoc>();
  const text = await readFile(path, 'utf8').catch(() => '');
  for (const line of text.split('\n')) {
    let doc: unknown;
    try {
      doc = JSON.parse(line);
    } catch {
      continue;
    }
    if (!doc || typeof doc !== 'object') continue;
    const d = doc as FoundryDoc;
    const id = typeof d._id === 'string' ? d._id : String(byId.size);
    if (d.$$deleted) byId.delete(id);
    else byId.set(id, d);
  }
  return [...byId.values()];
}

type Sublevels = Map<string, Map<string, FoundryDoc>>;

/** Documents by sublevel ("scenes.tokens") and id path ("<scene>.<token>"). */
function sublevels(entries: Map<string, string>): Sublevels {
  const out: Sublevels = new Map();
  for (const [key, value] of entries) {
    const match = /^!([^!]+)!(.+)$/.exec(key);
    if (!match) continue;
    let doc: unknown;
    try {
      doc = JSON.parse(value);
    } catch {
      continue;
    }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) continue;
    const level = out.get(match[1]!) ?? new Map<string, FoundryDoc>();
    level.set(match[2]!, doc as FoundryDoc);
    out.set(match[1]!, level);
  }
  return out;
}

const isIdList = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === 'string');

/** `doc` with each list of embedded ids replaced by the documents (missing ones left out). */
function embed(doc: FoundryDoc, level: string, path: string, all: Sublevels): FoundryDoc {
  const out: FoundryDoc = { ...doc };
  for (const [field, value] of Object.entries(doc)) {
    const sub = all.get(`${level}.${field}`);
    if (!sub || !isIdList(value)) continue;
    out[field] = value.flatMap((id) => {
      const child = sub.get(`${path}.${id}`);
      return child ? [embed(child, `${level}.${field}`, `${path}.${id}`, all)] : [];
    });
  }
  return out;
}

/** The top-level documents of a LevelDB's entries, with their embedded documents in place. */
export function foundryDocs(entries: Map<string, string>): FoundryDoc[] {
  const all = sublevels(entries);
  return [...all].flatMap(([level, docs]) =>
    level.includes('.') ? [] : [...docs].map(([id, doc]) => embed(doc, level, id, all)),
  );
}

const isDir = (path: string) =>
  stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );

/** The documents of the database at `path`: a LevelDB folder, a `.db` file, or `path`.db; [] if none. */
export async function readFoundryDb(path: string): Promise<FoundryDoc[]> {
  if (await isDir(path)) return foundryDocs(await readLevelDb(path));
  return readNedb(path.endsWith('.db') ? path : `${path}.db`);
}

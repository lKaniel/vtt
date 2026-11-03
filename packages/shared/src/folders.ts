import { canReparent, childrenOf, type Doc, type DocRef, freeId, keyBetween, type Op, slugify } from '@vtt/core';
import { z } from 'zod';
import { IdSchema as id } from './schema.ts';

// Folders in the sidebar lists, as in Foundry: each is a document of its own
// (folders/<id>.json) that holds the documents of one list (its `kind`, the
// collection they are in). A document names the folder it is in by `folder`,
// a folder the one it sits in by `parent`. Deleting a folder lets what it
// held out into its parent.

/** The sidebar lists that keep folders, by the collection of their documents. */
export const FOLDER_KINDS = ['actors', 'scenes', 'journals', 'tables', 'macros', 'playlists', 'cards'] as const;
export type FolderKind = (typeof FOLDER_KINDS)[number];

export const FOLDERS = 'folders';

export const FolderSchema = z.object({
  id,
  name: z.string().min(1),
  /** The list it is in: the collection of the documents it holds. */
  kind: z.enum(FOLDER_KINDS),
  /** The folder it sits in; missing = the top of the list. */
  parent: id.optional(),
  /** Its colour in the list. */
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  /** Fractional key among its siblings (see sort-key.ts in core). */
  sort: z.string().optional(),
});
export type Folder = z.infer<typeof FolderSchema>;

interface Source {
  get(coll: string, id: string): Doc | undefined;
  all(coll: string): Doc[];
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const parentOf = (folder: Doc) => str(folder.parent);
const asNode = (d: Doc) => ({ ...d, parent: parentOf(d), sort: str(d.sort) });

export const isFolderKind = (coll: string): coll is FolderKind => (FOLDER_KINDS as readonly string[]).includes(coll);

/** The folders of one list. */
export function foldersOf(src: Source, kind: string): Doc[] {
  return src.all(FOLDERS).filter((f) => f.kind === kind);
}

/** The folder a document is in, when it names one that exists. */
export function folderOf(src: Source, doc: Doc): Doc | undefined {
  const at = str(doc.folder);
  return at ? src.get(FOLDERS, at) : undefined;
}

/** Folder `id` and those it sits in, nearest first; stops at a loop. */
export function foldersAbove(src: Source, id: string | undefined): Doc[] {
  const out: Doc[] = [];
  const seen = new Set<string>();
  for (let at = id; at && !seen.has(at);) {
    seen.add(at);
    const folder = src.get(FOLDERS, at);
    if (!folder) break;
    out.push(folder);
    at = parentOf(folder);
  }
  return out;
}

/** A new folder at the end of its siblings, with a free id: the ops that make it, and its id. */
export function newFolderOps(
  src: Source,
  { kind, name, parent, color }: { kind: FolderKind; name: string; parent?: string; color?: string },
): { id: string; ops: Op[] } {
  const folders = src.all(FOLDERS);
  const last = childrenOf(folders.filter((f) => f.kind === kind).map(asNode), parent).at(-1);
  const docId = freeId(slugify(name), (x) => !!src.get(FOLDERS, x), { bare: true });
  const doc = {
    id: docId,
    type: 'folder',
    rev: 0,
    name,
    kind,
    sort: keyBetween(last?.sort ?? null, null),
    ...(parent ? { parent } : {}),
    ...(color ? { color } : {}),
  } as Doc;
  return { id: docId, ops: [{ op: 'create', coll: FOLDERS, doc }] };
}

/**
 * Puts documents (and folders) into folder `to`, or at the top of their list
 * when it is undefined. A folder never goes into itself or one below it.
 */
export function moveToFolderOps(src: Source, refs: readonly DocRef[], to: string | undefined): Op[] {
  const nodes = src.all(FOLDERS).map(asNode);
  return refs.flatMap((ref): Op[] => {
    const doc = src.get(ref.coll, ref.id);
    if (!doc) return [];
    if (ref.coll !== FOLDERS) {
      return str(doc.folder) === to
        ? []
        : [{ op: 'update', coll: ref.coll, id: ref.id, patch: { folder: to ?? null } }];
    }
    if (parentOf(doc) === to || !canReparent(nodes, ref.id, to)) return [];
    return [{ op: 'update', coll: FOLDERS, id: ref.id, patch: { parent: to ?? null } }];
  });
}

/** The nearest folder above `id` that stays. */
function survivor(src: Source, id: string, gone: ReadonlySet<string>): string | undefined {
  return foldersAbove(src, id).find((f) => !gone.has(f.id))?.id;
}

/** What else changes when the ops delete folders: what they held moves up to the nearest folder that stays. */
export function folderDeleteOps(src: Source, ops: readonly Op[]): Op[] {
  const gone = new Set(ops.flatMap((op) => (op.op === 'delete' && op.coll === FOLDERS ? [op.id] : [])));
  if (!gone.size) return [];
  const deleted = new Set(ops.flatMap((op) => (op.op === 'delete' ? [`${op.coll}\u0000${op.id}`] : [])));
  const up = (folder: string) => survivor(src, folder, gone) ?? null;
  const kinds = new Set([...gone].map((f) => src.get(FOLDERS, f)?.kind).filter(isString));
  const held = [...kinds].flatMap((coll) =>
    src
      .all(coll)
      .filter((d) => gone.has(str(d.folder) ?? '') && !deleted.has(`${coll}\u0000${d.id}`))
      .map((d): Op => ({ op: 'update', coll, id: d.id, patch: { folder: up(d.folder as string) } })),
  );
  const inner = src
    .all(FOLDERS)
    .filter((f) => !gone.has(f.id) && gone.has(parentOf(f) ?? ''))
    .map((f): Op => ({ op: 'update', coll: FOLDERS, id: f.id, patch: { parent: up(f.parent as string) } }));
  return [...held, ...inner];
}

const isString = (v: unknown): v is string => typeof v === 'string';

/** Whether someone who sees the documents `sees` lets through may know of `folder`: something in it, or below it, is theirs to see. */
export function folderSeen(src: Source, folder: Doc, sees: (coll: string, doc: Doc) => boolean): boolean {
  const coll = str(folder.kind);
  if (!coll) return false;
  const inside = (doc: Doc) => foldersAbove(src, str(doc.folder)).some((f) => f.id === folder.id);
  return src.all(coll).some((doc) => inside(doc) && sees(coll, doc));
}

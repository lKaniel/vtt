import { z } from 'zod';
import { freeId } from './ids.ts';
import { DocSchema, type Doc, type Op } from './ops.ts';

// Copy, cut, paste, duplicate and delete work the same way on every kind of
// document. Each type says once, in a registry of kinds, where it lives,
// which of its fields point at other documents and how it moves; the UI has
// no clipboard code of its own. A copy is plain JSON with a type marker, so
// it can go through the system clipboard to another scene or browser tab.

type Point = [number, number];

export interface Kind {
  /** The collection documents of this type live in, given the scene they are pasted into. */
  coll: (scene: string) => string;
  /** Fields (dotted paths) holding the id of another document, and that document's type. */
  refs?: Readonly<Record<string, string>>;
  /** The field naming the document this one sits in: copying or deleting the parent takes it along. */
  parent?: string;
  /** True for a parent that is deleted along with the last thing in it (a group). */
  dropsWhenEmpty?: (doc: Doc) => boolean;
  /** Where a placeable sits on its scene; undefined for one with no place of its own (a group). */
  anchor?: (doc: Doc) => Point | undefined;
  /** The document moved by dx, dy. */
  shift?: (doc: Doc, dx: number, dy: number) => Doc;
}

/** Every document type that edit commands work on, by `type`. */
export type Kinds = Readonly<Record<string, Kind>>;

/** Documents taken by copy or cut, ready to paste. */
export interface Clip {
  docs: Doc[];
}

/** What a document is found by: its collection and id. */
export interface DocRef {
  coll: string;
  id: string;
}

interface Source {
  get(coll: string, id: string): Doc | undefined;
  all(coll: string): Doc[];
}

const CLIPBOARD_TYPE = 'vtt/documents';

const ClipboardSchema = z.object({ type: z.literal(CLIPBOARD_TYPE), v: z.literal(1), docs: z.array(DocSchema) });

function read(doc: Doc, path: string): unknown {
  let value: unknown = doc;
  for (const key of path.split('.')) value = (value as Record<string, unknown> | undefined)?.[key];
  return value;
}

function write(doc: Doc, path: string, value: unknown): Doc {
  const [key, ...rest] = path.split('.') as [string, ...string[]];
  if (!rest.length) return { ...doc, [key]: value };
  return { ...doc, [key]: write(doc[key] as Doc, rest.join('.'), value) };
}

/** The document without the field at `path`. */
function unset(doc: Doc, path: string): Doc {
  const [key, ...rest] = path.split('.') as [string, ...string[]];
  if (rest.length) return { ...doc, [key]: unset(doc[key] as Doc, rest.join('.')) };
  const { [key]: _gone, ...kept } = doc;
  return kept as Doc;
}

/** The documents `refs` name plus, for each, everything sitting in it. */
function withChildren(src: Source, kinds: Kinds, refs: readonly DocRef[]): { coll: string; doc: Doc }[] {
  const found = new Map<string, { coll: string; doc: Doc }>();
  const visit = (coll: string, doc: Doc): void => {
    const key = `${coll}\u0000${doc.id}`;
    if (found.has(key)) return;
    found.set(key, { coll, doc });
    for (const child of src.all(coll)) {
      const parent = kinds[child.type]?.parent;
      if (parent && read(child, parent) === doc.id) visit(coll, child);
    }
  };
  for (const { coll, id } of refs) {
    const doc = src.get(coll, id);
    if (doc) visit(coll, doc);
  }
  return [...found.values()];
}

/** Copies documents and their children, without revisions. */
export function copyDocs(src: Source, kinds: Kinds, refs: readonly DocRef[]): Clip {
  return { docs: withChildren(src, kinds, refs).map(({ doc }) => ({ ...doc, rev: 0 })) };
}

const parentId = (kinds: Kinds, doc: Doc): string | undefined => {
  const path = kinds[doc.type]?.parent;
  const value = path ? read(doc, path) : undefined;
  return typeof value === 'string' ? value : undefined;
};

/** A parent that drops when empty and has nothing left in it once `gone` is deleted. */
function emptied(src: Source, kinds: Kinds, at: DocRef, gone: ReadonlySet<string>): Doc | undefined {
  const parent = src.get(at.coll, at.id);
  if (!parent || !kinds[parent.type]?.dropsWhenEmpty?.(parent) || gone.has(`${at.coll}\u0000${at.id}`))
    return undefined;
  const left = src.all(at.coll).some((d) => parentId(kinds, d) === at.id && !gone.has(`${at.coll}\u0000${d.id}`));
  return left ? undefined : parent;
}

/** Deletes documents and their children, and groups they leave empty, as one transaction. */
export function deleteOps(src: Source, kinds: Kinds, refs: readonly DocRef[]): Op[] {
  const found = withChildren(src, kinds, refs);
  const gone = new Set(found.map(({ coll, doc }) => `${coll}\u0000${doc.id}`));
  // Grows as emptied parents join, so their own parents are looked at too.
  for (const { coll, doc } of found) {
    const up = parentId(kinds, doc);
    const parent = up === undefined ? undefined : emptied(src, kinds, { coll, id: up }, gone);
    if (!parent) continue;
    gone.add(`${coll}\u0000${parent.id}`);
    found.push({ coll, doc: parent });
  }
  return found.map(({ coll, doc }): Op => ({ op: 'delete', coll, id: doc.id }));
}

/** The id a pasted copy gets: its own when free there, else the next free number. */
function freshId(id: string, taken: (id: string) => boolean): string {
  if (!taken(id)) return id;
  return freeId(id.replace(/-\d+$/, ''), taken);
}

/** Points the copy's links at the new copies; links to things outside the copy stay. */
function relink(doc: Doc, kind: Kind, renamed: ReadonlyMap<string, string>): Doc {
  let out = doc;
  for (const [path, type] of Object.entries(kind.refs ?? {})) {
    const target = read(doc, path);
    const fresh = typeof target === 'string' ? renamed.get(`${type}\u0000${target}`) : undefined;
    if (fresh) out = write(out, path, fresh);
  }
  return out;
}

/**
 * The ops that paste a copy into `scene`, placeables moved by `offset`: every
 * document gets a fresh id. Documents of a type not in `kinds` are skipped.
 */
export function pasteOps(
  src: Source,
  kinds: Kinds,
  clip: Clip,
  { scene, offset }: { scene: string; offset: Point },
): { ops: Op[]; ids: string[] } {
  const docs = clip.docs.filter((d) => kinds[d.type]);
  const used = new Set<string>();
  const renamed = new Map<string, string>();
  const placed = docs.map((doc) => {
    const coll = kinds[doc.type]!.coll(scene);
    const id = freshId(doc.id, (i) => used.has(`${coll}\u0000${i}`) || !!src.get(coll, i));
    used.add(`${coll}\u0000${id}`);
    renamed.set(`${doc.type}\u0000${doc.id}`, id);
    return { coll, doc: { ...doc, id, rev: 0 } };
  });
  const ops = placed.map(({ coll, doc }): Op => {
    const kind = kinds[doc.type]!;
    const moved = kind.shift ? kind.shift(doc, offset[0], offset[1]) : doc;
    const linked = relink(moved, kind, renamed);
    const parent = parentId(kinds, linked);
    const lost = parent !== undefined && !used.has(`${coll}\u0000${parent}`) && !src.get(coll, parent);
    return { op: 'create', coll, doc: lost ? unset(linked, kind.parent!) : linked };
  });
  return { ops, ids: placed.map((p) => p.doc.id) };
}

/** How far to move a copy so its middle lands on `at`, in whole grid squares to keep it on the grid. */
export function pasteOffset(kinds: Kinds, clip: Clip, at: Point, grid: number): Point {
  const points = clip.docs.flatMap((d) => {
    const at = kinds[d.type]?.anchor?.(d);
    return at ? [at] : [];
  });
  if (!points.length) return [0, 0];
  const mid = (axis: 0 | 1): number => {
    const values = points.map((p) => p[axis]);
    return (Math.min(...values) + Math.max(...values)) / 2;
  };
  const snap = (d: number): number => Math.round(d / grid) * grid;
  return [snap(at[0] - mid(0)), snap(at[1] - mid(1))];
}

/** The text a copy is put on the system clipboard as. */
export function clipboardText(clip: Clip): string {
  return JSON.stringify({ type: CLIPBOARD_TYPE, v: 1, docs: clip.docs });
}

/** A copy read back from the system clipboard, or undefined for anything else. */
export function parseClipboard(text: string): Clip | undefined {
  try {
    const parsed = ClipboardSchema.safeParse(JSON.parse(text));
    return parsed.success ? { docs: parsed.data.docs } : undefined;
  } catch {
    return undefined;
  }
}

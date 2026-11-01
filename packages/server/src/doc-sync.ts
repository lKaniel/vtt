import { docPatch, type Doc, type Op } from '@vtt/core';

// Game objects (tokens, walls, the game itself) are stored as documents in
// the core DocStore: the object plus its `type` and `rev`. These helpers
// turn objects into documents and back, and turn "the file now says this"
// into the ops that get the store there.

/** A document for `data`. Objects without an id (a scene, the fight) get `id`. */
export function toDoc(type: string, data: object, id?: string): Doc {
  return { ...data, ...(id === undefined ? {} : { id }), type, rev: 0 } as Doc;
}

/** The object a document holds: without `type` and `rev`, and without `id` when it was given one. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- callers name the type their collection holds
export function fromDoc<T>(doc: Doc, keepId = true): T {
  const { type: _type, rev: _rev, id, ...rest } = doc;
  return (keepId ? { id, ...rest } : rest) as T;
}

/** JSON with object keys sorted, so field order doesn't count as a change. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function same(a: Doc, b: Doc): boolean {
  return stable(fromDoc(a)) === stable(fromDoc(b));
}

/**
 * Ops that turn the documents `current` into `next`, all in collection
 * `coll`: unchanged documents are left alone, so their revisions stay.
 */
export function diffOps(coll: string, current: readonly Doc[], next: readonly Doc[]): Op[] {
  const before = new Map(current.map((d) => [d.id, d]));
  const ops: Op[] = [];
  for (const doc of next) {
    const old = before.get(doc.id);
    before.delete(doc.id);
    if (!old) ops.push({ op: 'create', coll, doc });
    else if (!same(old, doc)) ops.push({ op: 'update', coll, id: doc.id, patch: docPatch(old, doc) });
  }
  for (const id of before.keys()) ops.push({ op: 'delete', coll, id });
  return ops;
}

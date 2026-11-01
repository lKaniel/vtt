import { RevisionError, type Doc, type DocStore, type Op, type Patch } from './ops.ts';

// Undo works on what a step changed, not on the ops it was made of: for each
// document, how it was before the step and the revision the step left it
// at. Reverting puts every document back in one transaction, and is refused
// if any of them has moved on since (someone else changed it). Reverting a
// revert is redo.

/** One document a step changed: how it was before, and its revision after (none when the step removed it). */
export interface Change {
  coll: string;
  id: string;
  before?: Doc;
  after?: number;
}

type Reader = Pick<DocStore, 'get'>;

const FIXED = new Set(['id', 'type', 'rev']);
const slot = (coll: string, id: string): string => `${coll}\u0000${id}`;

/** Collects what one or more transactions change, for a single undo step. */
export class ChangeLog {
  private seen = new Map<string, { coll: string; id: string; before?: Doc }>();

  /** Call before a transaction touches `coll`/`id`; only the first state counts. */
  note(coll: string, id: string, store: Reader): void {
    const key = slot(coll, id);
    if (!this.seen.has(key)) this.seen.set(key, { coll, id, before: store.get(coll, id) });
  }

  /** True when nothing was touched at all. */
  get empty(): boolean {
    return this.seen.size === 0;
  }

  /** What changed by now, leaving out documents that ended as they began. */
  changes(store: Reader): Change[] {
    const out: Change[] = [];
    for (const { coll, id, before } of this.seen.values()) {
      const now = store.get(coll, id);
      if (now && before && !differs(before, now)) continue;
      if (!now && !before) continue;
      out.push({ coll, id, ...(before && { before }), ...(now && { after: now.rev }) });
    }
    return out;
  }
}

/** True when two versions of a document hold different fields. */
function differs(a: Doc, b: Doc): boolean {
  return Object.keys(docPatch(a, b)).length > 0;
}

/** The patch that turns `from`'s fields into `to`'s: the fields that differ, and null for those `to` dropped. */
export function docPatch(from: Doc, to: Doc): Patch {
  const patch: Patch = {};
  for (const key of Object.keys(from)) if (!FIXED.has(key) && !(key in to)) patch[key] = null;
  for (const [key, value] of Object.entries(to)) {
    if (!FIXED.has(key) && JSON.stringify(from[key]) !== JSON.stringify(value)) patch[key] = value;
  }
  return patch;
}

function moved(change: Change): RevisionError {
  return new RevisionError(change.coll, change.id, `${change.id} has changed since`);
}

function revertOne(store: Reader, change: Change): Op[] {
  const { coll, id, before, after } = change;
  const now = store.get(coll, id);
  if (now?.rev !== after) throw moved(change);
  if (!now) return before ? [{ op: 'create', coll, doc: before }] : [];
  if (!before) return [{ op: 'delete', coll, id, rev: now.rev }];
  return [{ op: 'update', coll, id, rev: now.rev, patch: docPatch(now, before) }];
}

/**
 * The transaction that puts every changed document back as it was before.
 * Throws a RevisionError naming the first one that has moved on since.
 */
export function revertOps(store: Reader, changes: readonly Change[]): Op[] {
  return changes.flatMap((change) => revertOne(store, change));
}

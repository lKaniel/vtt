import { type Change, ChangeLog, type Doc, type Op } from '@vtt/core';

// What GameStore keeps for undo: the step being recorded and who changed
// each document last, so a refused undo can say who got there first.

/** Who last changed a document when it was a hand edit of the files. */
export const BY_FILES = '';

/** A document a transaction touches, with how it was before. */
export interface Touched {
  coll: string;
  id: string;
  before?: Doc;
}

const slot = (coll: string, id: string): string => `${coll}\u0000${id}`;

/** The documents `ops` touch, each with how it was before. */
export function touchedBy(ops: readonly Op[], get: (coll: string, id: string) => Doc | undefined): Touched[] {
  const touched = new Map<string, Touched>();
  for (const op of ops) {
    const id = op.op === 'create' ? op.doc.id : op.id;
    const key = slot(op.coll, id);
    if (!touched.has(key)) touched.set(key, { coll: op.coll, id, before: get(op.coll, id) });
  }
  return [...touched.values()];
}

export class StoreHistory {
  private log?: ChangeLog;
  /** Whose step is being recorded. */
  author?: string;
  private editors = new Map<string, string>();

  /** Runs `fn` and returns what it changed, as one step by `by`. A step inside a step is part of it. */
  record(by: string, docs: { get: (coll: string, id: string) => Doc | undefined }, fn: () => void): Change[] {
    if (this.log) {
      fn();
      return [];
    }
    const log = new ChangeLog();
    this.log = log;
    this.author = by;
    try {
      fn();
    } finally {
      this.log = undefined;
      this.author = undefined;
    }
    return log.changes(docs);
  }

  /** Notes a committed transaction: part of the step being recorded, unless it came from the files. */
  committed(touched: readonly Touched[], fromDisk: boolean): void {
    const by = fromDisk ? BY_FILES : this.author;
    for (const t of touched) {
      if (!fromDisk) this.log?.note(t.coll, t.id, { get: () => t.before });
      if (by !== undefined) this.editors.set(slot(t.coll, t.id), by);
    }
  }

  /** A player id, BY_FILES, or undefined when nobody has changed it since the server started. */
  lastEditor(coll: string, id: string): string | undefined {
    return this.editors.get(slot(coll, id));
  }
}

import { z } from 'zod';

// Every edit to a game is a transaction of document ops: create, update or
// delete one document in a named collection. Applying a transaction returns
// its inverse, which is how undo works, and revisions catch edits made
// against a document that has changed since.

export const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');

/** The fields every document has. Types add their own on top. */
export const DocSchema = z.looseObject({
  id: IdSchema,
  type: z.string().min(1),
  /** Bumped on every change; 0 or missing on a document not stored yet. */
  rev: z.number().int().nonnegative().default(0),
});
export type Doc = z.infer<typeof DocSchema>;

/** A patch sets fields; `null` removes one. */
const PatchSchema = z.record(z.string(), z.unknown());
export type Patch = z.infer<typeof PatchSchema>;

export const OpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), coll: z.string().min(1), doc: DocSchema }),
  z.object({
    op: z.literal('update'),
    coll: z.string().min(1),
    id: IdSchema,
    /** The revision the patch was made against; refused if the document has moved on. */
    rev: z.number().int().optional(),
    patch: PatchSchema,
  }),
  z.object({ op: z.literal('delete'), coll: z.string().min(1), id: IdSchema, rev: z.number().int().optional() }),
]);
export type Op = z.infer<typeof OpSchema>;

/** An op that can't be applied, with a message for whoever sent it. */
export class OpError extends Error {}

/** A document has moved on (or come back) since the op was made: someone else changed it. */
export class RevisionError extends OpError {
  constructor(
    readonly coll: string,
    readonly id: string,
    message: string,
  ) {
    super(message);
  }
}

/** Checks (and may normalise) each document before it is written. */
export type Validate = (coll: string, doc: Doc) => Doc;

const FIXED_KEYS = new Set(['id', 'type', 'rev']);

function patched(doc: Doc, patch: Patch): Doc {
  const fixed = Object.keys(patch).find((key) => FIXED_KEYS.has(key));
  if (fixed) throw new OpError(`${doc.id}: ${fixed} can't be changed`);
  const merged = Object.entries({ ...doc, ...patch }).filter(([, value]) => value !== null);
  return { ...(Object.fromEntries(merged) as Doc), rev: doc.rev + 1 };
}

/** The patch that puts back what `patch` changed on `doc`. */
function unpatch(doc: Doc, patch: Patch): Patch {
  const back: Patch = {};
  for (const key of Object.keys(patch)) back[key] = key in doc ? doc[key] : null;
  return back;
}

function checkRev(coll: string, doc: Doc, rev: number | undefined): void {
  if (rev !== undefined && rev !== doc.rev) {
    throw new RevisionError(coll, doc.id, `${doc.id} has changed since (revision ${doc.rev}, not ${rev})`);
  }
}

const slot = (coll: string, id: string): string => `${coll}\u0000${id}`;

/** Collections of documents held in memory, changed only through transactions. */
export class DocStore {
  private colls = new Map<string, Map<string, Doc>>();
  private validate: Validate;

  constructor({ validate }: { validate?: Validate } = {}) {
    this.validate = validate ?? ((_coll, doc) => doc);
  }

  get(coll: string, id: string): Doc | undefined {
    return this.colls.get(coll)?.get(id);
  }

  all(coll: string): Doc[] {
    return [...(this.colls.get(coll)?.values() ?? [])];
  }

  /**
   * Sets documents as another store has them, without checks or revisions
   * of its own: how a client follows the server. A change without `doc` is
   * a deletion.
   */
  mirror(changes: readonly { coll: string; id: string; doc?: Doc }[]): void {
    for (const { coll, id, doc } of changes) this.commit(coll, id, doc ?? null);
  }

  /** The names of the collections that hold documents. */
  collections(): string[] {
    return [...this.colls].filter(([, docs]) => docs.size).map(([name]) => name);
  }

  /**
   * Apply every op or none. Returns the inverse transaction: applying it puts
   * the documents back, unless someone has changed them in between.
   * `validate` replaces the store's own check for this transaction (ops
   * that came from a client get the stricter one).
   */
  apply(ops: readonly Op[], { validate = this.validate }: { validate?: Validate } = {}): Op[] {
    const staged = new Map<string, { coll: string; id: string; doc: Doc | null }>();
    const read = (coll: string, id: string): Doc | undefined => {
      const hit = staged.get(slot(coll, id));
      return hit ? (hit.doc ?? undefined) : this.get(coll, id);
    };
    const write = (coll: string, id: string, doc: Doc | null): void => {
      staged.set(slot(coll, id), { coll, id, doc: doc && validate(coll, doc) });
    };
    const inverse = ops.map((op) => this.stage(op, read, write)).reverse();
    for (const { coll, id, doc } of staged.values()) this.commit(coll, id, doc);
    return inverse;
  }

  private stage(
    op: Op,
    read: (coll: string, id: string) => Doc | undefined,
    write: (coll: string, id: string, doc: Doc | null) => void,
  ): Op {
    if (op.op === 'create') {
      if (read(op.coll, op.doc.id)) throw new OpError(`${op.doc.id} already exists in ${op.coll}`);
      const doc = { ...op.doc, rev: op.doc.rev + 1 };
      write(op.coll, doc.id, doc);
      return { op: 'delete', coll: op.coll, id: doc.id, rev: doc.rev };
    }
    const doc = read(op.coll, op.id);
    if (!doc) throw new OpError(`${op.id} is not in ${op.coll}`);
    checkRev(op.coll, doc, op.rev);
    if (op.op === 'delete') {
      write(op.coll, op.id, null);
      return { op: 'create', coll: op.coll, doc };
    }
    const next = patched(doc, op.patch);
    write(op.coll, op.id, next);
    return { op: 'update', coll: op.coll, id: op.id, rev: next.rev, patch: unpatch(doc, op.patch) };
  }

  private commit(coll: string, id: string, doc: Doc | null): void {
    const docs = this.colls.get(coll) ?? new Map<string, Doc>();
    this.colls.set(coll, docs);
    if (doc) docs.set(id, doc);
    else docs.delete(id);
  }
}

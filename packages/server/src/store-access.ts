import type { Doc, DocStore } from '@vtt/core';
import { type Actor, resolveToken, type TokenEntry } from '@vtt/system-dnd5e';
import type { Owned } from '@vtt/shared';
import { fromDoc } from './doc-sync.ts';

// The game's documents as ownership sees them: who may change them
// (op-permissions.ts) and who is sent them (doc-feed.ts).

/** What a stored document is, for deciding who may touch it. */
export type OwnedDoc = Owned & { name?: unknown; hidden?: boolean; visibleTo?: string[] };

export interface DocAccess {
  get(coll: string, id: string): Doc | undefined;
  /** The document as ownership is decided on it: a token read together with its actor. */
  owned(coll: string, doc: Doc): OwnedDoc;
  /** Every document, by collection. */
  all(): Record<string, Doc[]>;
  /** Token documents, on any scene, that stand for actor `id`. */
  tokenDocsOf(id: string): { coll: string; doc: Doc }[];
}

export class StoreAccess implements DocAccess {
  constructor(
    private docs: DocStore,
    private actors: ReadonlyMap<string, Actor>,
  ) {}

  get(coll: string, id: string): Doc | undefined {
    return this.docs.get(coll, id);
  }

  owned(coll: string, doc: Doc): OwnedDoc {
    if (!coll.endsWith('/tokens')) return doc as OwnedDoc;
    const entry = fromDoc<TokenEntry>(doc);
    return resolveToken(entry, entry.actor ? this.actors.get(entry.actor) : undefined).token ?? entry;
  }

  all(): Record<string, Doc[]> {
    return Object.fromEntries(this.docs.collections().map((coll) => [coll, this.docs.all(coll)]));
  }

  tokenDocsOf(id: string): { coll: string; doc: Doc }[] {
    const colls = this.docs.collections().filter((c) => c.endsWith('/tokens'));
    return colls.flatMap((coll) =>
      this.docs
        .all(coll)
        .filter((d) => d.actor === id)
        .map((doc) => ({ coll, doc })),
    );
  }
}

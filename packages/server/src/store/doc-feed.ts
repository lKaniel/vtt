import type { Doc } from '@vtt/core';
import { type DocChange, isGm, type Player } from '@vtt/shared';
import { dependents, sendsTo, viewOf } from './doc-visibility.ts';
import type { DocAccess } from './store-access.ts';

// The documents each client is sent. The GM gets every document; a player
// gets those doc-visibility.ts allows (the actors and tokens they observe,
// entries shared with them, what is shown on their scene), and is told a
// document is gone when that stops, so they never learn a document exists
// that they may not know about.

const key = (coll: string, id: string) => `${coll}\u0000${id}`;

export class DocFeed {
  /** Documents this client has been sent and not told are gone. */
  private sent = new Set<string>();

  /** `scene`: the scene the client is on now. */
  constructor(
    private source: DocAccess,
    private scene: () => string,
  ) {}

  private sends(player: Player, coll: string, doc: Doc): boolean {
    return sendsTo({ player, scene: this.scene() }, this.source, coll, doc);
  }

  private view(player: Player, coll: string, doc: Doc): Doc {
    return viewOf({ player, scene: this.scene() }, this.source, coll, doc);
  }

  /** Everything `player` may have now, by collection, for a welcome. */
  start(player: Player): Record<string, Doc[]> {
    this.sent.clear();
    const out: Record<string, Doc[]> = {};
    for (const [coll, docs] of Object.entries(this.source.all())) {
      const mine = docs.filter((doc) => this.sends(player, coll, doc));
      if (!mine.length) continue;
      out[coll] = mine.map((doc) => this.view(player, coll, doc));
      for (const doc of mine) this.sent.add(key(coll, doc.id));
    }
    return out;
  }

  /** What `player` is told of a transaction: the changes they may see, and the documents they lost. */
  // fallow-ignore-next-line unused-class-member -- Game calls it through Client.feed
  changes(player: Player, changes: readonly DocChange[]): DocChange[] {
    if (isGm(player)) return [...changes];
    const out: DocChange[] = [];
    const direct = changes.length;
    this.withDependents(changes).forEach((change, i) => {
      const k = key(change.coll, change.id);
      if (!change.doc || !this.sends(player, change.coll, change.doc)) {
        if (this.sent.delete(k)) out.push({ coll: change.coll, id: change.id });
        return;
      }
      // A linked token (or a note) whose own document didn't change is only sent when it comes into view.
      if (i >= direct && this.sent.has(k)) return;
      this.sent.add(k);
      out.push({ ...change, doc: this.view(player, change.coll, change.doc) });
    });
    return out;
  }

  /** The changes, then what may come into or go out of view with them: linked tokens, notes on an entry. */
  private withDependents(changes: readonly DocChange[]): DocChange[] {
    const linked = this.withLinkedTokens(changes);
    const seen = new Set(linked.map((c) => key(c.coll, c.id)));
    const notes = changes
      .flatMap((c) => dependents(this.source, c.coll, c.id))
      .filter(({ coll, doc }) => !seen.has(key(coll, doc.id)))
      .map(({ coll, doc }) => ({ coll, id: doc.id, doc }));
    return [...linked, ...notes];
  }

  /** An actor's ownership is its linked tokens' too: they are looked at again when it changes. */
  private withLinkedTokens(changes: readonly DocChange[]): DocChange[] {
    const seen = new Set(changes.map((c) => key(c.coll, c.id)));
    const extra = changes
      .filter((c) => c.coll === 'actors')
      .flatMap((c) => this.source.tokenDocsOf(c.id))
      .filter(({ coll, doc }) => !seen.has(key(coll, doc.id)))
      .map(({ coll, doc }) => ({ coll, id: doc.id, doc }));
    return [...changes, ...extra];
  }
}

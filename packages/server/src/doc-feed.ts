import type { Doc } from '@vtt/core';
import { isGm, type DocChange, type Player } from '@vtt/shared';
import { sendsDoc } from './op-permissions.ts';
import type { DocAccess } from './store-access.ts';

// The documents each client is sent. The GM gets every document; a player
// gets the actors and tokens they see and may read in full (observer or
// owner, not hidden), and is told a document is gone when that stops, so
// they never learn a document exists that they may not know about.

const key = (coll: string, id: string) => `${coll}\u0000${id}`;

export class DocFeed {
  /** Documents this client has been sent and not told are gone. */
  private sent = new Set<string>();

  constructor(private source: DocAccess) {}

  /** Everything `player` may have now, by collection, for a welcome. */
  start(player: Player): Record<string, Doc[]> {
    this.sent.clear();
    const out: Record<string, Doc[]> = {};
    for (const [coll, docs] of Object.entries(this.source.all())) {
      const mine = docs.filter((doc) => sendsDoc(player, this.source, coll, doc));
      if (!mine.length) continue;
      out[coll] = mine;
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
    this.withLinkedTokens(changes).forEach((change, i) => {
      const k = key(change.coll, change.id);
      if (!change.doc || !sendsDoc(player, this.source, change.coll, change.doc)) {
        if (this.sent.delete(k)) out.push({ coll: change.coll, id: change.id });
        return;
      }
      // A linked token whose own document didn't change is only sent when it comes into view.
      if (i >= direct && this.sent.has(k)) return;
      this.sent.add(k);
      out.push(change);
    });
    return out;
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

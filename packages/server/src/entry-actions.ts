import { randomUUID } from 'node:crypto';
import { canObserve, drawFrom, drawnPatch, isGm, type Player, type Rng, type RollTable } from '@vtt/shared';
import type { ChatMessage } from '@vtt/system-dnd5e';
import { fromDoc } from './doc-sync.ts';
import type { GameStore } from './game-store.ts';
import { Refusal } from './table.ts';

// Sidebar documents in play: rolling on a roll table into chat, and the GM
// showing a journal entry to the players (it is shared with them, then
// opened on their screens).

type EntryMessage =
  { t: 'rollTable'; table: string; gmOnly?: boolean } | { t: 'showJournal'; entry: string; page?: string };

export const isEntryMessage = (msg: { t: string }): msg is EntryMessage =>
  msg.t === 'rollTable' || msg.t === 'showJournal';

interface Out {
  post(message: ChatMessage): void;
  show(entry: string, page?: string): void;
}

export class EntryActions {
  constructor(
    private store: GameStore,
    private rng: Rng,
    private out: Out,
  ) {}

  handle(player: Player, msg: EntryMessage): void {
    if (msg.t === 'rollTable') this.roll(player, msg.table, !!msg.gmOnly);
    else this.show(player, msg.entry, msg.page);
  }

  private roll(player: Player, id: string, gmOnly: boolean): void {
    const doc = this.store.docs.get('tables', id);
    const owned = doc && this.store.access.owned('tables', doc);
    if (!doc || !owned || !canObserve(owned, player)) throw new Refusal('No such table');
    const table = fromDoc<RollTable>(doc);
    const drawn = drawFrom(table, this.rng);
    if (!drawn) throw new Refusal(`Everything on ${table.name} has been drawn: reset it first`);
    const patch = drawnPatch(table, drawn.index);
    if (patch) this.store.applyOps([{ op: 'update', coll: 'tables', id, patch }]);
    const text = `${table.name}: ${table.results[drawn.index]!.text} (${drawn.roll} on 1d${drawn.of})`;
    const base = { id: randomUUID(), time: Date.now(), from: player.name, color: player.color };
    this.out.post({ ...base, text, ...(gmOnly ? { gmOnly } : {}) });
  }

  private show(player: Player, id: string, page?: string): void {
    if (!isGm(player)) throw new Refusal('Only the GM can show journal entries');
    const doc = this.store.docs.get('journals', id);
    if (!doc) throw new Refusal('No such journal entry');
    const level = (doc.ownership as { default?: string } | undefined)?.default;
    if (level !== 'observer' && level !== 'owner') {
      const ownership = { ...(doc.ownership as object | undefined), default: 'observer' };
      this.store.applyOps([{ op: 'update', coll: 'journals', id, patch: { ownership } }]);
    }
    this.out.show(id, page);
  }
}

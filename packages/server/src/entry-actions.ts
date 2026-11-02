import { randomUUID } from 'node:crypto';
import { canObserve, drawFrom, drawnPatch, isGm, type Player, type Rng, type RollTable } from '@vtt/shared';
import type { ChatMessage, ServerMessage } from '@vtt/system-dnd5e';
import { signedBy } from './seat-settings.ts';
import { fromDoc } from './doc-sync.ts';
import type { GameStore } from './game-store.ts';
import { Refusal } from './table.ts';

// Sidebar documents in play: rolling on a roll table into chat, and the GM
// showing a journal entry or a picture to the players (it is shared with them, then
// opened on their screens).

type EntryMessage =
  | { t: 'rollTable'; table: string; gmOnly?: boolean }
  | { t: 'showJournal'; entry: string; page?: string }
  | { t: 'showImage'; src: string; title?: string };

const ENTRY_MESSAGES = new Set(['rollTable', 'showJournal', 'showImage']);
export const isEntryMessage = (msg: { t: string }): msg is EntryMessage => ENTRY_MESSAGES.has(msg.t);

interface Out {
  post(message: ChatMessage): void;
  /** Sends every player (not the GM) a message. */
  toPlayers(msg: Extract<ServerMessage, { t: 'showJournal' | 'showImage' }>): void;
}

export class EntryActions {
  constructor(
    private store: GameStore,
    private rng: Rng,
    private out: Out,
  ) {}

  handle(player: Player, msg: EntryMessage): void {
    if (msg.t === 'rollTable') this.roll(player, msg.table, !!msg.gmOnly);
    else if (msg.t === 'showJournal') this.show(player, msg.entry, msg.page);
    else this.showImage(player, msg.src, msg.title);
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
    const base = { ...signedBy(player), id: randomUUID(), time: Date.now() };
    this.out.post({ ...base, by: player.id, text, ...(gmOnly && { mode: 'gm' as const }) });
  }

  private show(player: Player, id: string, page?: string): void {
    if (!isGm(player)) throw new Refusal('Only the GM can show journal entries');
    if (!shareEntry(this.store, id)) throw new Refusal('No such journal entry');
    this.out.toPlayers({ t: 'showJournal', entry: id, ...(page && { page }) });
  }

  /** GM: a picture (an asset, a token's art) opens on the players' screens. */
  private showImage(player: Player, src: string, title?: string): void {
    if (!isGm(player)) throw new Refusal('Only the GM can show pictures');
    this.out.toPlayers({ t: 'showImage', src, ...(title && { title }) });
  }
}

/** Lets every player see a journal entry (default ownership observer); false when there is no such entry. */
export function shareEntry(store: GameStore, id: string): boolean {
  const doc = store.docs.get('journals', id);
  if (!doc) return false;
  const level = (doc.ownership as { default?: string } | undefined)?.default;
  if (level !== 'observer' && level !== 'owner') {
    const ownership = { ...(doc.ownership as object | undefined), default: 'observer' };
    store.applyOps([{ op: 'update', coll: 'journals', id, patch: { ownership } }]);
  }
  return true;
}

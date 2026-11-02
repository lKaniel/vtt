import { type CompendiumDrop, dropOnSheet, handOver, type SheetArea, SPELL_SCROLL } from '@vtt/system-dnd5e';
import { canControl, canEdit, type Player } from '@vtt/shared';
import type { ClientMessage } from './client-messages.ts';
import { contentFor } from './game-packs.ts';
import { Piles } from './pile-actions.ts';
import { Refusal, requireGm, type Table } from './table.ts';

type Give = Extract<ClientMessage, { t: 'give' }>;
type DropMessage = Extract<ClientMessage, { t: 'drop' | 'give' | 'trade' }>;

export const isDropMessage = (msg: ClientMessage): msg is DropMessage =>
  msg.t === 'drop' || msg.t === 'give' || msg.t === 'trade';

/**
 * Drag and drop onto character sheets (see system-dnd5e sheet-drops.ts):
 * compendium entries dropped on a sheet someone may edit, items handed
 * from a creature to another, and trading with piles (pile-actions.ts).
 */
export class SheetDrops {
  private piles: Piles;

  constructor(private table: Table) {
    this.piles = new Piles(table);
  }

  private get store() {
    return this.table.store;
  }

  handle(player: Player, canSee: (id: string) => boolean, msg: DropMessage): void {
    if (msg.t === 'trade') this.piles.trade(player, canSee, msg);
    else if (msg.t === 'give') this.give(player, canSee, msg);
    else this.drop(player, msg.what, msg.onto, msg.area);
  }

  /** `what` dropped on the `area` of a token's sheet (editors) or an actor's (the GM). */
  drop(player: Player, what: CompendiumDrop, onto: { kind: 'token' | 'actor'; id: string }, area?: SheetArea): void {
    if (onto.kind === 'actor') {
      requireGm(player);
      const actor = this.store.actors.get(onto.id);
      if (!actor) throw new Refusal('No such actor');
      return this.store.setActor(outcome(dropOnSheet(actor, what, area, contentFor(this.store, actor))).sheet);
    }
    const token = this.store.tokens.get(onto.id);
    if (!token) throw new Refusal('No such token');
    if (!canEdit(token, player)) throw new Refusal(`You can't edit ${token.name}`);
    this.store.setToken(outcome(dropOnSheet(token, what, area, contentFor(this.store, token))).sheet);
  }

  /** A creature `player` controls hands a stack to one they can see. */
  give(player: Player, canSee: (id: string) => boolean, msg: Give): void {
    const from = this.store.tokens.get(msg.from);
    const to = this.store.tokens.get(msg.to);
    if (!from) throw new Refusal('No such token');
    if (!canControl(from, player)) throw new Refusal(`You don't control ${from.name}`);
    if (!to || !canSee(to.id)) throw new Refusal('No such token');
    if (to.id === from.id) throw new Refusal('Hand it to another creature');
    const out = outcome(handOver(from, to, msg));
    this.store.setToken(out.from);
    this.store.setToken(out.to);
    const qty = from.inventory?.find((e) => e.item === msg.item && e.spell === msg.spell)?.qty ?? 1;
    const what = this.itemName(from, msg);
    this.table.note(`${from.name} hands ${to.name} ${qty > 1 ? String(qty) + ' × ' + what : what}`);
  }

  private itemName(token: Parameters<typeof contentFor>[1], what: Pick<Give, 'item' | 'spell'>): string {
    const content = contentFor(this.store, token);
    const name = content.items.get(what.item)?.name ?? what.item;
    if (what.item !== SPELL_SCROLL || !what.spell) return name;
    return `${name} of ${content.spells.get(what.spell)?.name ?? what.spell}`;
  }
}

/** What a rule allowed, or its refusal. */
function outcome<T extends object>(out: T | { problem: string }): T {
  if ('problem' in out) throw new Refusal(out.problem);
  return out;
}

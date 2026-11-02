import { randomUUID } from 'node:crypto';
import type { Op } from '@vtt/core';
import {
  canControl,
  canSee,
  type Card,
  type CardStack,
  isGm,
  moveCards,
  type Player,
  recallCards,
  type Rng,
  shuffled,
  topKeys,
} from '@vtt/shared';
import type { ChatMessage } from '@vtt/system-dnd5e';
import type { EngineClientMessage } from '@vtt/shared';
import { fromDoc } from '../store/doc-sync.ts';
import type { GameStore } from '../store/game-store.ts';
import { signedBy } from './seat-settings.ts';
import { Refusal } from '../play/table.ts';

// Cards in play (cards/<id>.json): drawing from a deck into a hand you
// own, passing or playing cards from a stack you own onto one you can see,
// shuffling a stack you own, and the GM dealing and gathering a deck back.
// These are the only ways a player moves cards (op-permissions.ts keeps
// them from writing `cards`), and each tells the table in chat.

export type CardMessage = Extract<
  EngineClientMessage,
  { t: 'drawCards' | 'passCards' | 'shuffleCards' | 'dealCards' | 'resetCards' }
>;

export const CARD_MESSAGES = new Set(['drawCards', 'passCards', 'shuffleCards', 'dealCards', 'resetCards']);

const COLL = 'cards';
const plural = (n: number) => (n === 1 ? '1 card' : `${n} cards`);
const listed = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
const update = (s: Pick<CardStack, 'id'>, cards: Card[]): Op => ({
  op: 'update',
  coll: COLL,
  id: s.id,
  patch: { cards },
});

export class CardActions {
  constructor(
    private store: GameStore,
    private rng: Rng,
    private post: (message: ChatMessage) => void,
  ) {}

  handle(player: Player, msg: CardMessage): void {
    if (msg.t === 'drawCards') this.draw(player, msg.from, msg.to, msg.n ?? 1);
    else if (msg.t === 'passCards') this.pass(player, msg.from, msg.to, msg.cards);
    else if (msg.t === 'shuffleCards') this.shuffle(player, msg.stack);
    else if (msg.t === 'dealCards') this.deal(player, msg.from, msg.to, msg.n ?? 1);
    else this.reset(player, msg.deck);
  }

  /** The stack, when the player may know of it; `control` also needs them to own it. */
  private stack(player: Player, id: string): CardStack {
    const doc = this.store.docs.get(COLL, id);
    if (!doc || !canSee(this.store.access.owned(COLL, doc), player)) throw new Refusal('No such cards');
    return fromDoc<CardStack>(doc);
  }

  private owns(player: Player, s: CardStack): boolean {
    return canControl(this.store.access.owned(COLL, this.store.docs.get(COLL, s.id)!), player);
  }

  private draw(player: Player, fromId: string, toId: string, n: number): void {
    const [from, to] = [this.stack(player, fromId), this.stack(player, toId)];
    if (!this.owns(player, to)) throw new Refusal(`You can’t put cards in ${to.name}`);
    if (from.kind !== 'deck') throw new Refusal(`${from.name} isn’t a deck`);
    const moved = moveCards(from.cards, to.cards, topKeys(from.cards, n));
    if (!moved) throw new Refusal(`${from.name} has no cards left`);
    this.store.applyOps([update(from, moved.from), update(to, moved.to)]);
    this.say(player, `draws ${plural(moved.moved.length)} from ${from.name}`);
  }

  private pass(player: Player, fromId: string, toId: string, keys: string[]): void {
    const [from, to] = [this.stack(player, fromId), this.stack(player, toId)];
    if (!this.owns(player, from)) throw new Refusal('Those cards aren’t yours to move');
    const moved = moveCards(from.cards, to.cards, keys);
    if (!moved) throw new Refusal(`${from.name} doesn’t hold those cards`);
    this.store.applyOps([update(from, moved.from), update(to, moved.to)]);
    const names = listed(moved.moved.map((c) => c.name));
    if (to.kind === 'pile') this.say(player, `plays ${names} onto ${to.name}`);
    else this.say(player, `passes ${plural(moved.moved.length)} to ${to.name}`);
  }

  private shuffle(player: Player, id: string): void {
    const s = this.stack(player, id);
    if (!this.owns(player, s)) throw new Refusal(`Only its owner can shuffle ${s.name}`);
    this.store.applyOps([update(s, shuffled(s.cards, this.rng))]);
    this.say(player, `shuffles ${s.name}`);
  }

  /** GM: `n` cards to each stack named, one at a time around the table. */
  private deal(player: Player, fromId: string, toIds: string[], n: number): void {
    if (!isGm(player)) throw new Refusal('Only the GM can deal cards');
    const from = this.stack(player, fromId);
    const hands = toIds.map((id) => this.stack(player, id));
    const left = [...from.cards];
    const got = hands.map((): Card[] => []);
    for (let round = 0; round < n; round++) for (const cards of got) if (left.length) cards.push(left.shift()!);
    this.store.applyOps([update(from, left), ...hands.map((h, i) => update(h, [...got[i]!, ...h.cards]))]);
    this.say(player, `deals ${plural(n)} to ${listed(hands.map((h) => h.name))}`);
  }

  /** GM: every card of the deck back in it, from every stack, shuffled. */
  private reset(player: Player, id: string): void {
    if (!isGm(player)) throw new Refusal('Only the GM can gather a deck');
    const deck = this.stack(player, id);
    const others = this.store.docs
      .all(COLL)
      .filter((d) => d.id !== id)
      .map((d) => fromDoc<CardStack>(d));
    const back = recallCards(deck, others);
    const changed = back.others.filter((s, i) => s.cards.length !== others[i]!.cards.length);
    this.store.applyOps([update(deck, shuffled(back.deck, this.rng)), ...changed.map((s) => update(s, s.cards))]);
    this.say(player, `gathers ${deck.name} and shuffles it`);
  }

  private say(player: Player, text: string): void {
    this.post({
      ...signedBy(player),
      id: randomUUID(),
      time: Date.now(),
      by: player.id,
      text: `${player.name} ${text}`,
    });
  }
}

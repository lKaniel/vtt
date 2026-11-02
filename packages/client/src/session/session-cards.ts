import { type Doc, type DocStore, freeId, type Op, slugify } from '@vtt/core';
import { canControl, type Card, type Owned, type Player, standardDeck } from '@vtt/shared';
import type { ClientMessage } from '@vtt/system-dnd5e';

// Cards (cards/<id>.json): the decks, hands and piles you were sent, and
// the moves the server makes for you (card-actions.ts there). A deck you
// may not look into, or another's hand, comes as a count without cards.

type StackKind = 'deck' | 'hand' | 'pile';

/** A stack of cards as the sidebar shows it. */
export interface CardStackView {
  id: string;
  name: string;
  kind: StackKind;
  /** Its cards, top first, when you may see them. */
  cards: Card[];
  count: number;
  doc: Doc;
}

const NAMES: Record<StackKind, string> = { deck: 'Deck', hand: 'Hand', pile: 'Pile' };
/** Who sees what by default: a deck's and a hand's count, a pile's cards. */
const SEEN: Record<StackKind, string> = { deck: 'limited', hand: 'limited', pile: 'observer' };

function viewOf(doc: Doc): CardStackView {
  const cards = Array.isArray(doc.cards) ? (doc.cards as Card[]) : [];
  const kind = (doc.kind as StackKind | undefined) ?? 'deck';
  const count = typeof doc.count === 'number' ? doc.count : cards.length;
  return { id: doc.id, name: typeof doc.name === 'string' ? doc.name : doc.id, kind, cards, count, doc };
}

/** What the cards need of the session: its documents, your seat, and a way to the server. */
export interface CardHost {
  readonly docs: DocStore;
  readonly you?: Player;
  send(msg: ClientMessage): void;
  readonly edits: { sendChanges(label: string, ops: readonly Op[]): void };
}

/** Your cards, as `session.cards`. */
export class Cards {
  constructor(private readonly s: CardHost) {}

  /** Every stack you were sent, by name. */
  stacks(): CardStackView[] {
    return this.s.docs
      .all('cards')
      .map(viewOf)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The hands you hold (the GM: every hand). */
  hands(): CardStackView[] {
    const you = this.s.you;
    return this.stacks().filter((s) => s.kind === 'hand' && !!you && canControl(s.doc as Owned, you));
  }

  draw(from: string, to: string, n = 1): void {
    this.s.send({ t: 'drawCards', from, to, n });
  }

  /** Moves cards (by cardKey) from a stack you hold onto another; onto a pile plays them. */
  pass(from: string, to: string, cards: string[]): void {
    this.s.send({ t: 'passCards', from, to, cards });
  }

  shuffle(stack: string): void {
    this.s.send({ t: 'shuffleCards', stack });
  }

  /** GM: `n` cards from a deck to each stack named. */
  deal(from: string, to: string[], n = 1): void {
    this.s.send({ t: 'dealCards', from, to, n });
  }

  /** GM: every card of a deck back in it, shuffled. */
  reset(deck: string): void {
    this.s.send({ t: 'resetCards', deck });
  }

  /** GM: a new deck (`standard`: of 52 playing cards), a hand (held by `owner`) or a pile. */
  create(kind: StackKind, opts: { name?: string; owner?: string; standard?: boolean } = {}): void {
    const name = opts.name ?? (opts.standard ? 'Playing cards' : NAMES[kind]);
    const id = freeId(slugify(name), (x) => !!this.s.docs.get('cards', x), { bare: true });
    const ownership = { default: SEEN[kind], ...(opts.owner && { [opts.owner]: 'owner' }) };
    const cards = opts.standard ? standardDeck(id) : [];
    const doc = { id, type: 'cards', rev: 0, name, kind, cards, ownership } as Doc;
    this.s.edits.sendChanges('new cards', [{ op: 'create', coll: 'cards', doc }]);
  }
}

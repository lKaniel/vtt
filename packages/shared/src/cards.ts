import type { Rng } from './dice.ts';
import type { Card } from './journals.ts';

// Moving cards between decks, hands and piles (cards/<id>.json): drawn
// from the top, played or passed onto the top of another stack, shuffled,
// and gathered back to the deck they came from.

/** A card's key within any stack: two decks may both have an "ace-of-spades". */
export const cardKey = (c: Pick<Card, 'id' | 'origin'>): string => `${c.origin}/${c.id}`;

/** The keys of the top `n` cards. */
export const topKeys = (cards: readonly Card[], n: number): string[] => cards.slice(0, n).map(cardKey);

/** The cards named taken out of `from` and put on top of `to`; undefined when one is not in `from`. */
export function moveCards(
  from: readonly Card[],
  to: readonly Card[],
  keys: readonly string[],
): { from: Card[]; to: Card[]; moved: Card[] } | undefined {
  const byKey = new Map(from.map((c) => [cardKey(c), c]));
  const moved = [...new Set(keys)].map((k) => byKey.get(k));
  if (!moved.length || moved.some((c) => !c)) return undefined;
  const taken = new Set(keys);
  const cards = moved as Card[];
  return { from: from.filter((c) => !taken.has(cardKey(c))), to: [...cards, ...to], moved: cards };
}

/** The cards in a random order. */
export function shuffled<T>(cards: readonly T[], rng: Rng): T[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface Held {
  id: string;
  cards: Card[];
}

/** Every card of `deck` back in it (the ones it holds first), and what the other stacks keep. */
export function recallCards(deck: Held, stacks: readonly Held[]): { deck: Card[]; others: Held[] } {
  const ours = (c: Card) => c.origin === deck.id;
  const back = stacks.flatMap((s) => s.cards.filter(ours));
  return {
    deck: [...deck.cards, ...back],
    others: stacks.map((s) => ({ id: s.id, cards: s.cards.filter((c) => !ours(c)) })),
  };
}

const SUITS = [
  ['spades', '♠'],
  ['hearts', '♥'],
  ['diamonds', '♦'],
  ['clubs', '♣'],
] as const;
const VALUES = [
  ['A', 'Ace'],
  ['2', '2'],
  ['3', '3'],
  ['4', '4'],
  ['5', '5'],
  ['6', '6'],
  ['7', '7'],
  ['8', '8'],
  ['9', '9'],
  ['10', '10'],
  ['J', 'Jack'],
  ['Q', 'Queen'],
  ['K', 'King'],
] as const;

/** A deck of 52 playing cards for deck `origin`, faces drawn from suit and value. */
export function standardDeck(origin: string): Card[] {
  return SUITS.flatMap(([suitName, suit]) =>
    VALUES.map(([value, valueName]) => ({
      id: `${valueName.toLowerCase()}-of-${suitName}`,
      name: `${valueName} of ${suitName[0]!.toUpperCase()}${suitName.slice(1)}`,
      origin,
      suit,
      value,
    })),
  );
}

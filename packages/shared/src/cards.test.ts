import { describe, expect, it } from 'vitest';
import { cardKey, moveCards, recallCards, shuffled, standardDeck, topKeys } from './cards.ts';
import { CardStackSchema, type CardStack } from './journals.ts';

// Cards (Foundry's Cards): decks, hands and piles hold cards, which move
// between them; a card remembers its deck, which a reset gathers it back to.

const deck = (id: string, n: number): CardStack =>
  CardStackSchema.parse({ id, name: id, kind: 'deck', cards: standardDeck(id).slice(0, n) });

describe('a deck of cards', () => {
  it('comes as 52 playing cards, each knowing its deck', () => {
    const cards = standardDeck('poker');
    expect(cards).toHaveLength(52);
    expect(cards[0]).toEqual({ id: 'ace-of-spades', name: 'Ace of Spades', origin: 'poker', suit: '♠', value: 'A' });
    expect(new Set(cards.map(cardKey)).size).toBe(52);
  });

  it('shuffles into a new order and keeps every card', () => {
    const cards = standardDeck('poker');
    let i = 0;
    const order = shuffled(cards, () => (i++ * 0.37) % 1);
    expect(order.map(cardKey)).not.toEqual(cards.map(cardKey));
    const sorted = (keys: string[]) => keys.toSorted((a, b) => a.localeCompare(b));
    expect(sorted(order.map(cardKey))).toEqual(sorted(cards.map(cardKey)));
  });

  it('is drawn from the top', () => {
    expect(topKeys(deck('poker', 5).cards, 2)).toEqual(['poker/ace-of-spades', 'poker/2-of-spades']);
  });
});

describe('moving cards', () => {
  it('takes the cards named from one stack and puts them on top of another', () => {
    const from = deck('poker', 3).cards;
    const moved = moveCards(from, [], ['poker/2-of-spades']);
    expect(moved?.from.map((c) => c.id)).toEqual(['ace-of-spades', '3-of-spades']);
    expect(moved?.to.map((c) => c.id)).toEqual(['2-of-spades']);
    expect(moveCards(moved!.from, moved!.to, ['poker/ace-of-spades'])?.to.map((c) => c.id)).toEqual([
      'ace-of-spades',
      '2-of-spades',
    ]);
  });

  it('moves nothing when a card named is not there', () => {
    expect(moveCards(deck('poker', 2).cards, [], ['poker/king-of-hearts'])).toBeUndefined();
  });

  it('gathers a deck’s cards back from every stack, leaving other decks’ cards', () => {
    const tarot = deck('tarot', 1).cards[0]!;
    const [a, b, c] = deck('poker', 3).cards;
    const stacks = [
      { id: 'hand', cards: [a!, tarot] },
      { id: 'pile', cards: [b!] },
    ];
    const back = recallCards({ id: 'poker', cards: [c!] }, stacks);
    expect(back.deck.map((x) => x.id)).toEqual(['3-of-spades', 'ace-of-spades', '2-of-spades']);
    expect(back.others).toEqual([
      { id: 'hand', cards: [tarot] },
      { id: 'pile', cards: [] },
    ]);
  });
});

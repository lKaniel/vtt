import type { Doc, Op } from '@vtt/core';
import { cardKey, standardDeck } from '@vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// Cards in play: players draw from a deck into their hand and play onto a
// pile; the GM deals, shuffles and gathers a deck back. Players never see
// a deck's order or another's hand, and only move cards through these
// actions.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeWorld());
  await store.load();
  game = new Game(store, { rng: () => 0 });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string, keep = false): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  if (!keep) ws.sent = [];
  return ws;
}

const stack = (doc: Record<string, unknown> & { id: string }): Op => ({
  op: 'create',
  coll: 'cards',
  doc: { rev: 0, type: 'cards', cards: [], ...doc },
});

const errors = (ws: FakeSocket) => ws.take('error').map((e) => e.message);
const keysIn = (id: string) =>
  ((store.docs.get('cards', id)?.cards ?? []) as { id: string; origin: string }[]).map(cardKey);
const said = (ws: FakeSocket) => ws.take('chat').map((c) => c.message.text);

function table(gm: FakeSocket): void {
  gm.receive({
    t: 'ops',
    txn: 't',
    ops: [
      stack({
        id: 'poker',
        name: 'Poker',
        kind: 'deck',
        cards: standardDeck('poker'),
        ownership: { default: 'limited' },
      }),
      stack({ id: 'ana-hand', name: 'Ana’s hand', kind: 'hand', ownership: { default: 'limited', ana: 'owner' } }),
      stack({ id: 'bo-hand', name: 'Bo’s hand', kind: 'hand', ownership: { default: 'limited', bo: 'owner' } }),
      stack({ id: 'discard', name: 'Discard', kind: 'pile', ownership: { default: 'observer' } }),
    ],
  });
}

/** The latest copy of document `id` the socket was sent, on joining or since. */
const sentDoc = (ws: FakeSocket, id: string) =>
  ws.sent
    .filter((m) => 'docs' in m)
    .flatMap((m) => Object.values((m as unknown as { docs: Record<string, Doc[]> }).docs).flat())
    .filter((d) => d.id === id)
    .at(-1);

describe('cards', () => {
  it('are drawn from the top of a deck into your hand, and the table hears how many', () => {
    const gm = seat('gm');
    table(gm);
    const ana = seat('ana');
    ana.receive({ t: 'drawCards', from: 'poker', to: 'ana-hand', n: 2 });
    expect(errors(ana)).toEqual([]);
    expect(keysIn('ana-hand')).toEqual(['poker/ace-of-spades', 'poker/2-of-spades']);
    expect(keysIn('poker')).toHaveLength(50);
    expect(said(gm)).toEqual(['Ana draws 2 cards from Poker']);
  });

  it('show players a deck’s count and others’ hands without their cards', () => {
    const gm = seat('gm');
    table(gm);
    gm.receive({ t: 'dealCards', from: 'poker', to: ['ana-hand', 'bo-hand'], n: 1 });
    const ana = seat('ana', true);
    expect(sentDoc(ana, 'poker')).toMatchObject({ cards: [], count: 50 });
    expect(sentDoc(ana, 'bo-hand')).toMatchObject({ cards: [], count: 1 });
    expect(sentDoc(ana, 'ana-hand')?.cards).toHaveLength(1);
  });

  it('are played from your hand onto a pile, face up', () => {
    const gm = seat('gm');
    table(gm);
    const ana = seat('ana');
    ana.receive({ t: 'drawCards', from: 'poker', to: 'ana-hand', n: 1 });
    ana.take('chat');
    ana.receive({ t: 'passCards', from: 'ana-hand', to: 'discard', cards: ['poker/ace-of-spades'] });
    expect(keysIn('discard')).toEqual(['poker/ace-of-spades']);
    expect(said(ana)).toEqual(['Ana plays Ace of Spades onto Discard']);
  });

  it('stay where they are when you try to move what is not yours', () => {
    const gm = seat('gm');
    table(gm);
    gm.receive({ t: 'dealCards', from: 'poker', to: ['bo-hand'], n: 1 });
    const ana = seat('ana');
    ana.receive({
      t: 'ops',
      txn: 't',
      ops: [{ op: 'update', coll: 'cards', id: 'ana-hand', patch: { cards: standardDeck('poker') } }],
    });
    expect(ana.take('reject').map((r) => r.reason)).toEqual(['Cards move by drawing, passing and playing']);
    ana.receive({ t: 'drawCards', from: 'poker', to: 'bo-hand' });
    ana.receive({ t: 'passCards', from: 'bo-hand', to: 'discard', cards: ['poker/ace-of-spades'] });
    ana.receive({ t: 'passCards', from: 'ana-hand', to: 'discard', cards: ['poker/king-of-hearts'] });
    ana.receive({ t: 'dealCards', from: 'poker', to: ['ana-hand'], n: 5 });
    expect(errors(ana)).toEqual([
      'You can’t put cards in Bo’s hand',
      'Those cards aren’t yours to move',
      'Ana’s hand doesn’t hold those cards',
      'Only the GM can deal cards',
    ]);
    expect(keysIn('ana-hand')).toEqual([]);
  });

  it('are shuffled and gathered back by the GM', () => {
    const gm = seat('gm');
    table(gm);
    gm.receive({ t: 'dealCards', from: 'poker', to: ['ana-hand', 'bo-hand'], n: 3 });
    gm.receive({ t: 'resetCards', deck: 'poker' });
    expect(keysIn('ana-hand')).toEqual([]);
    expect(keysIn('poker')).toHaveLength(52);
    expect(keysIn('poker')).not.toEqual(standardDeck('poker').map(cardKey));
    gm.receive({ t: 'shuffleCards', stack: 'poker' });
    expect(said(gm)).toEqual([
      'GM deals 3 cards to Ana’s hand and Bo’s hand',
      'GM gathers Poker and shuffles it',
      'GM shuffles Poker',
    ]);
  });
});

import type { Doc } from '@vtt/core';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';

// Cards in the session: the stacks you were sent, the hands you hold, and
// the moves (draw, play, pass, shuffle, deal, gather) sent to the server.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const card = (id: string) => ({ id, name: id, origin: 'poker' });
const poker: Doc = { id: 'poker', type: 'cards', rev: 1, name: 'Poker', kind: 'deck', cards: [], count: 50 };
const discard: Doc = { id: 'discard', type: 'cards', rev: 1, name: 'Discard', kind: 'pile', cards: [card('k')] };

function joinAs(role: 'gm' | 'player'): string {
  const base = welcome([]) as Extract<ServerMessage, { t: 'welcome' }>;
  const you = role === 'gm' ? { id: 'gm', name: 'GM', role, color: '#fc0' } : base.you;
  const mine: Doc = {
    id: 'mine',
    type: 'cards',
    rev: 1,
    name: 'Mine',
    kind: 'hand',
    cards: [card('a')],
    ownership: { default: 'limited', [base.you.id]: 'owner' },
  };
  ws.receive({ ...base, you, docs: { cards: [poker, discard, mine] } });
  return base.you.id;
}

const last = () => ws.sent.at(-1) as Record<string, unknown>;

describe('cards in the session', () => {
  it('list the stacks, how many cards each holds, and the hands you hold', () => {
    joinAs('player');
    expect(session.cards.stacks().map((s) => [s.id, s.kind, s.count])).toEqual([
      ['discard', 'pile', 1],
      ['mine', 'hand', 1],
      ['poker', 'deck', 50],
    ]);
    expect(session.cards.hands().map((s) => s.id)).toEqual(['mine']);
  });

  it('send each move to the server', () => {
    joinAs('player');
    session.cards.draw('poker', 'mine', 2);
    expect(last()).toEqual({ t: 'drawCards', from: 'poker', to: 'mine', n: 2 });
    session.cards.pass('mine', 'discard', ['poker/a']);
    expect(last()).toEqual({ t: 'passCards', from: 'mine', to: 'discard', cards: ['poker/a'] });
    session.cards.shuffle('mine');
    expect(last()).toEqual({ t: 'shuffleCards', stack: 'mine' });
    session.cards.deal('poker', ['mine'], 3);
    expect(last()).toEqual({ t: 'dealCards', from: 'poker', to: ['mine'], n: 3 });
    session.cards.reset('poker');
    expect(last()).toEqual({ t: 'resetCards', deck: 'poker' });
  });

  it('let the GM make a deck of playing cards, a hand for a player and a pile', () => {
    const ana = joinAs('gm');
    session.cards.create('deck', { standard: true });
    session.cards.create('hand', { owner: ana, name: 'Ana’s hand' });
    session.cards.create('pile');
    const sent = ws.sent as { t: string; ops?: { doc: Doc }[] }[];
    const made = sent.flatMap((m) => (m.t === 'ops' ? (m.ops ?? []).map((o) => o.doc) : []));
    expect(made.map((d) => [d.id, d.kind, (d.cards as unknown[]).length, d.ownership])).toEqual([
      ['playing-cards', 'deck', 52, { default: 'limited' }],
      ['ana-s-hand', 'hand', 0, { default: 'limited', [ana]: 'owner' }],
      ['pile', 'pile', 0, { default: 'observer' }],
    ]);
    expect((made[0]!.cards as { origin: string }[])[0]!.origin).toBe('playing-cards');
  });
});

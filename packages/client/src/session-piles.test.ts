import { PileSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clickToken } from './map-clicks.ts';
import type { Session } from './session.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// Item piles at the table (session-piles.ts): clicking one opens its window,
// whose buttons trade for the creature you act with.

let session: Session;
let ws: FakeWebSocket;

const chest = { ...token('chest', 150, 50), ownership: { default: 'limited' as const }, pile: PileSchema.parse({}) };

beforeEach(() => {
  ({ session, ws } = openSession());
  ws.receive(welcome([token('hero'), chest]));
});

afterEach(() => closeSession(session));

describe('item piles', () => {
  it('open from a click, and close when the pile goes', () => {
    expect(clickToken(session, 'chest')).toMatchObject({ items: [{ label: 'Open chest' }] });
    session.select('hero');
    const click = clickToken(session, 'chest');
    expect(click.kind === 'prompt' && click.items.map((i) => i.label)).toEqual(['Open chest', 'Walk up to it']);
    if (click.kind === 'prompt') click.items[0]!.run();
    expect(session.pile).toBe('chest');
    session.openPile('hero');
    expect(session.pile).toBeUndefined();
    session.openPile('chest');
    ws.receive({ t: 'tokenGone', id: 'chest' });
    expect(session.pile).toBeUndefined();
  });

  it('trade for the creature you act with', () => {
    session.openPile('chest');
    session.trade('take', 1);
    expect(ws.sent.at(-1)).toEqual({ t: 'trade', from: 'chest', to: 'hero', item: 1 });
    session.trade('put', 0, 2);
    expect(ws.sent.at(-1)).toEqual({ t: 'trade', from: 'hero', to: 'chest', item: 0, qty: 2 });
    session.takeCoins({ gp: 3 });
    expect(ws.sent.at(-1)).toEqual({ t: 'trade', from: 'chest', to: 'hero', coins: { gp: 3 } });
  });
});

import { srdFor } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, expect, describe, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// Choosing what pays for a cast: a slot of some level, or a feature that
// casts the spell without one (session-actions.ts `aim`).

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
  ws.receive(welcome([token('hero'), token('goblin', 250, 50)]));
  session.select('hero');
});

afterEach(() => closeSession(session));

describe('with more than one way to pay', () => {
  const blur = srdFor('2014').spells.get('blur')!;
  const armor = srdFor('2014').spells.get('mage-armor')!;
  const shadows = {
    id: 'armor-of-shadows',
    name: 'Armor of Shadows',
    freeCasts: [{ spell: 'mage-armor', self: true }],
  };
  const caster = (left: number[]) => ({
    ...token('hero'),
    sheet: {
      effects: [],
      features: [shadows],
      caster: { level: 5, spells: [blur, armor], slots: [4, 3, 2], left },
    } as never,
  });

  it('waits for Cast on a self spell that could use another slot, and casts at once with only one', () => {
    ws.receive({ t: 'token', token: caster([0, 3, 2]) });
    session.actions.aim('blur', 2);
    expect(ws.sent.at(-1)).not.toMatchObject({ t: 'cast' });
    session.actions.aim('blur', 3);
    expect(session.actions.aiming).toMatchObject({ slot: 3, mode: 'self' });
    session.actions.confirmCast();
    expect(ws.sent.at(-1)).toMatchObject({ t: 'cast', spell: 'blur', slot: 3 });
    ws.receive({ t: 'token', token: caster([0, 1, 0]) });
    session.actions.aim('blur', 2);
    expect(ws.sent.at(-1)).toMatchObject({ t: 'cast', spell: 'blur', slot: 2 });
  });

  it('pays with a feature when asked, and goes back to a slot', () => {
    ws.receive({ t: 'token', token: caster([4, 3, 2]) });
    session.actions.aim('mage-armor', 1, { paidBy: 'armor-of-shadows' });
    expect(session.actions.aiming).toMatchObject({ paidBy: 'armor-of-shadows', mode: 'self' });
    session.actions.aim('mage-armor', 1);
    expect(session.actions.aiming).toMatchObject({ mode: 'creatures' });
    expect(session.actions.aiming).not.toHaveProperty('paidBy');
    session.actions.aim('mage-armor', 1, { paidBy: 'armor-of-shadows' });
    session.actions.confirmCast();
    expect(ws.sent.at(-1)).toMatchObject({ t: 'cast', spell: 'mage-armor', paidBy: 'armor-of-shadows' });
  });
});

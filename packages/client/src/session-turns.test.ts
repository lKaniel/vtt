import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, fight, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// Whose turn it is for this client, including BG3's shared party turns.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const mage = { ...token('mage'), ownership: { default: 'limited' as const, ana: 'owner' as const } };

describe('turns', () => {
  it('lets a party member sharing the turn walk and end it', () => {
    ws.receive(welcome([{ ...token('goblin'), ownership: { default: 'limited' } }, mage]));
    const combat = {
      ...fight(0),
      order: [
        { token: 'goblin', initiative: 20 },
        { token: 'mage', initiative: 5 },
      ],
    };
    ws.receive({ t: 'combat', combat });
    expect(session.isMyTurn()).toBe(false);
    expect(session.movementLeft('mage')).toBe(0);
    ws.receive({ t: 'combat', combat: { ...combat, group: ['mage'], side: { mage: { ...combat.left, move: 15 } } } });
    expect(session.isMyTurn()).toBe(true);
    expect(session.movementLeft('mage')).toBe(15);
    ws.receive({ t: 'combat', combat: { ...combat, group: ['mage'], done: ['mage'] } });
    expect(session.isMyTurn()).toBe(false);
  });

  it('starts a fight with shared party turns when asked', () => {
    ws.receive(welcome());
    session.startCombat(['hero'], true);
    expect(ws.sent.at(-1)).toEqual({ t: 'combatStart', tokens: ['hero'], shared: true });
  });
});

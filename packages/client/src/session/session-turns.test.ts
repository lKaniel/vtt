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
    expect(session.turns.mine()).toBe(false);
    expect(session.turns.movementLeft('mage')).toBe(0);
    ws.receive({ t: 'combat', combat: { ...combat, group: ['mage'], side: { mage: { ...combat.left, move: 15 } } } });
    expect(session.turns.mine()).toBe(true);
    expect(session.turns.movementLeft('mage')).toBe(15);
    ws.receive({ t: 'combat', combat: { ...combat, group: ['mage'], done: ['mage'] } });
    expect(session.turns.mine()).toBe(false);
  });

  it('gives the GM free movement for a creature waiting for its turn', () => {
    const gm = welcome([token('goblin'), mage]);
    ws.receive({ ...gm, you: { id: 'gm', name: 'GM', role: 'gm', color: '#f00' } } as typeof gm);
    const order = [
      { token: 'goblin', initiative: 20 },
      { token: 'mage', initiative: 5 },
    ];
    ws.receive({ t: 'combat', combat: { ...fight(0), order } });
    expect(session.turns.movementLeft('mage')).toBe(Infinity);
    expect(session.turns.movementLeft('goblin')).toBe(30);
  });

  it('gives a creature joining the turn its full speed', () => {
    ws.receive(welcome([token('goblin'), { ...mage, speed: 25 }]));
    const order = [
      { token: 'goblin', initiative: 20 },
      { token: 'mage', initiative: 5 },
      { token: 'gone', initiative: 1 },
    ];
    ws.receive({ t: 'combat', combat: { ...fight(0), order, group: ['mage', 'gone'] } });
    expect(session.turns.movementLeft('mage')).toBe(25);
    expect(session.turns.movementLeft('gone')).toBe(0);
  });

  it('ends only the selected creature’s turn on a shared turn', () => {
    ws.receive(welcome([token('hero'), mage]));
    const combat = {
      ...fight(0),
      order: [
        { token: 'hero', initiative: 20 },
        { token: 'mage', initiative: 5 },
      ],
    };
    ws.receive({ t: 'combat', combat: { ...combat, group: ['mage'] } });
    expect(session.turns.ending('mage')).toBe('mage');
    session.requests.endTurn(session.turns.ending('mage'));
    expect(ws.sent.at(-1)).toEqual({ t: 'endTurn', token: 'mage' });
    ws.receive({ t: 'combat', combat: { ...combat, group: ['mage'], done: ['mage'] } });
    expect(session.turns.ending('mage')).toBe('hero');
    expect(session.turns.ending(undefined)).toBe('hero');
  });

  it('hands you the next of yours sharing the turn once the selected one ends theirs', () => {
    ws.receive(welcome([token('hero'), mage]));
    const combat = {
      ...fight(0),
      order: [
        { token: 'hero', initiative: 20 },
        { token: 'mage', initiative: 5 },
      ],
    };
    ws.receive({ t: 'combat', combat: { ...combat, group: ['mage'] } });
    expect(session.selected).toBe('hero');
    ws.receive({ t: 'combat', combat: { ...combat, group: ['mage'], done: ['hero'] } });
    expect(session.selected).toBe('mage');
  });

  it('starts a fight with shared party turns when asked', () => {
    ws.receive(welcome());
    session.requests.startCombat(['hero'], true);
    expect(ws.sent.at(-1)).toEqual({ t: 'combatStart', tokens: ['hero'], shared: true });
  });
});

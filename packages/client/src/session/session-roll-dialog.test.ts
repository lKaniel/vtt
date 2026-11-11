import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asksByDefault } from './session-roll-dialog.ts';
import type { Session } from './session.ts';
import { closeSession, fight, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// The roll dialog (session-roll-dialog.ts): an action that rolls or spends
// something waits for the player's picks before it is sent.

let session: Session;
let ws: FakeWebSocket;

const hero = {
  ...token('hero'),
  sheet: {
    edition: '2014',
    attacks: [{ name: 'Longsword', kind: 'melee', toHit: 5, reach: 5, damage: [{ dice: '1d8', type: 'slashing' }] }],
    features: [],
    effects: [],
  } as never,
};

beforeEach(() => {
  ({ session, ws } = openSession());
  ws.receive(welcome([hero, token('goblin', 150, 50)]));
  session.select('hero');
  session.actions.rolls.setEnabled(true);
});

afterEach(() => closeSession(session));

const attack = () => {
  session.actions.arm('Longsword');
  session.actions.attack('goblin');
};

describe('the roll dialog', () => {
  it('holds an attack, asks the server for the default roll and shows it', () => {
    attack();
    expect(ws.sent.some((m) => (m as { t: string }).t === 'attack')).toBe(false);
    expect(session.actions.rolls.plan?.what).toMatchObject({ kind: 'attack', name: 'Longsword', target: 'goblin' });
    const asked = ws.sent.at(-1) as { t: string; ref: string };
    expect(asked).toMatchObject({ t: 'rollDefaults', roll: { kind: 'attack', target: 'goblin' } });
    ws.receive({ t: 'rollDefaults', ref: asked.ref, d20: 'disadvantage' });
    expect(session.actions.rolls.d20).toBe('disadvantage');
  });

  it('sends the action with the picks once confirmed', () => {
    attack();
    session.actions.rolls.confirm({ d20: 'advantage', situational: '+2' });
    expect(ws.sent.at(-1)).toEqual({
      t: 'attack',
      attacker: 'hero',
      target: 'goblin',
      attack: 'Longsword',
      d20: 'advantage',
      situational: '+2',
    });
    expect(session.actions.rolls.plan).toBeUndefined();
  });

  it('sends nothing when it is closed', () => {
    attack();
    const before = ws.sent.length;
    session.actions.rolls.cancel();
    expect(session.actions.rolls.plan).toBeUndefined();
    expect(ws.sent).toHaveLength(before);
  });

  it('ignores an answer for a roll it no longer shows', () => {
    attack();
    const { ref } = ws.sent.at(-1) as { ref: string };
    session.actions.rolls.cancel();
    session.requests.rollCheck('hero', { ability: 'str' });
    ws.receive({ t: 'rollDefaults', ref, d20: 'advantage' });
    expect(session.actions.rolls.d20).toBeUndefined();
  });

  it('offers what the attack spends only in a fight', () => {
    attack();
    expect(session.actions.rolls.plan?.spend).toBeUndefined();
    session.actions.rolls.cancel();
    ws.receive({ t: 'combat', combat: fight(1) });
    attack();
    expect(session.actions.rolls.plan?.spend).toBe('action');
  });

  it('lets everything through at once when it is turned off', () => {
    session.actions.rolls.setEnabled(false);
    attack();
    expect(ws.sent.at(-1)).toMatchObject({ t: 'attack', target: 'goblin' });
    expect(session.actions.rolls.plan).toBeUndefined();
  });

  it('is on for players and off for the GM until they choose', () => {
    expect(asksByDefault({ id: 'ana', name: 'Ana', role: 'player', color: '#f00' })).toBe(true);
    expect(asksByDefault({ id: 'gm', name: 'GM', role: 'gm', color: '#f00' })).toBe(false);
  });
});

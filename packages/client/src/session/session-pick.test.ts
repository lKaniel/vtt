import { srdFor } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// The roll pick (session-pick.ts): advantage, disadvantage or a critical
// chosen for the next roll, sent with it and then forgotten.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
  ws.receive(welcome([token('hero'), token('goblin', 250, 50)]));
  session.select('hero');
});

afterEach(() => closeSession(session));

describe('the roll pick', () => {
  it('goes with the next attack, then is back to normal', () => {
    session.actions.pick.set({ edge: 'advantage', crit: 'crit' });
    session.actions.arm('Longsword');
    session.actions.attack('goblin');
    expect(ws.sent.at(-1)).toMatchObject({ t: 'attack', edge: 'advantage', crit: 'crit' });
    expect(session.actions.pick.edge).toBeUndefined();
    session.actions.arm('Longsword');
    session.actions.attack('goblin');
    expect(ws.sent.at(-1)).not.toHaveProperty('edge');
  });

  it('gives a check its advantage or disadvantage, and keeps a critical for the next attack', () => {
    session.actions.pick.set({ edge: 'disadvantage', crit: 'normal' });
    session.requests.rollCheck('hero', { ability: 'dex' });
    expect(ws.sent.at(-1)).toEqual({ t: 'rollCheck', token: 'hero', ability: 'dex', edge: 'disadvantage' });
    expect(session.actions.pick).toMatchObject({ edge: undefined, crit: 'normal' });
  });

  it('picking the same again sets it back to normal', () => {
    session.actions.pick.set({ edge: 'advantage' });
    session.actions.pick.set({ edge: 'advantage' });
    expect(session.actions.pick.edge).toBeUndefined();
  });

  it('goes with a spell attack, but a spell without one leaves it for later', () => {
    const fireBolt = srdFor('2014').spells.get('fire-bolt')!;
    const fireball = srdFor('2014').spells.get('fireball')!;
    ws.receive({
      t: 'token',
      token: { ...token('hero'), sheet: { effects: [], caster: { level: 5, spells: [fireBolt, fireball] } } as never },
    });
    session.actions.pick.set({ edge: 'advantage' });
    session.actions.aim('fireball', 3);
    session.actions.castAt([250, 150]);
    expect(ws.sent.at(-1)).not.toHaveProperty('edge');
    session.actions.aim('fire-bolt', 0);
    session.actions.pickTarget('goblin');
    expect(ws.sent.at(-1)).toMatchObject({ t: 'cast', spell: 'fire-bolt', edge: 'advantage' });
  });
});

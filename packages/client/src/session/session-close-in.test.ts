import { srdFor } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { hoverAim } from '../play/walk-in-range.ts';
import { closeSession, fight, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// An attack or a spell at a creature out of reach walks the attacker into
// range first, as in BG3 (play/walk-in-range.ts).

let session: Session;
let ws: FakeWebSocket;

const sword = { name: 'Longsword', kind: 'melee', toHit: 5, damage: [{ dice: '1d8', type: 'slashing' }] };
const fireBolt = srdFor('2014').spells.get('fire-bolt')!;
const hero = {
  ...token('hero'),
  sheet: {
    attacks: [sword],
    effects: [],
    features: [],
    caster: { level: 5, spells: [fireBolt], slots: [4, 3, 2], left: [4, 3, 2] },
  } as never,
};
const goblin = { ...token('goblin', 1050, 50), ownership: undefined };
const kinds = () => ws.sent.map((m) => (m as { t: string }).t).filter((t) => ['move', 'attack', 'cast'].includes(t));

beforeEach(() => {
  ({ session, ws } = openSession());
  ws.receive(welcome([token('hero'), goblin]));
  ws.receive({ t: 'token', token: hero });
  session.select('hero');
});

afterEach(() => closeSession(session));

describe('walking into range', () => {
  it('walks up to a foe out of reach, then attacks it', () => {
    session.actions.arm('Longsword');
    session.actions.attack('goblin');
    expect(kinds()).toEqual(['move', 'attack']);
    const move = ws.sent.find((m) => (m as { t: string }).t === 'move') as { to: [number, number] };
    expect(move.to[0]).toBeGreaterThan(850);
  });

  it('attacks at once when the foe is in reach', () => {
    ws.receive({ t: 'token', token: { ...goblin, x: 150 } });
    session.actions.arm('Longsword');
    session.actions.attack('goblin');
    expect(kinds()).toEqual(['attack']);
  });

  it('says so and does nothing when the movement left in the fight falls short', () => {
    ws.receive({ t: 'combat', combat: fight(1, 30) });
    session.actions.arm('Longsword');
    session.actions.attack('goblin');
    expect(kinds()).toEqual([]);
    expect(session.error?.message).toMatch(/movement/i);
    expect(session.actions.armed).toBeUndefined();
  });

  it('walks into range of a spell, then casts it', () => {
    ws.receive({ t: 'token', token: { ...goblin, x: 50 + 40 * 100 } });
    session.actions.aim('fire-bolt', 0);
    session.actions.pickTarget('goblin');
    expect(kinds()).toEqual(['move', 'cast']);
  });
});

describe('the action ready at the pointer', () => {
  it('is the armed attack at the creature or point hovered', () => {
    const me = session.tokens.get('hero')!;
    expect(hoverAim(session, me, [500, 500])).toBeUndefined();
    session.actions.arm('Longsword');
    expect(hoverAim(session, me, [500, 500], 'goblin')).toMatchObject({ target: 'goblin' });
    expect(hoverAim(session, me, [500, 500])).toMatchObject({ point: [500, 500] });
  });

  it('is the aimed spell at the creatures picked and hovered, or at the point', () => {
    const me = session.tokens.get('hero')!;
    session.actions.aim('fire-bolt', 0);
    expect(hoverAim(session, me, [500, 500], 'goblin')).toMatchObject({ targets: ['goblin'] });
    expect(hoverAim(session, me, [500, 500])).toMatchObject({ targets: [], point: [500, 500] });
  });
});

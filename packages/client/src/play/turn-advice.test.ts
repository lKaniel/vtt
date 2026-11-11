import { resolveCreature, srdFor, type Token } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../session/session.ts';
import { closeSession, fight, openSession, token, welcome, type FakeWebSocket } from '../session/session.fixtures.ts';
import { takeAdvice, turnAdvice } from './turn-advice.ts';

// The GM's turn helper at the table: on a monster's turn the GM is shown
// what it does best, and one click selects it, aims at its target and
// attacks (walking it up first if it must).

let session: Session;
let ws: FakeWebSocket;

const withSheet = (t: Token) => ({ ...t, sheet: resolveCreature(t, srdFor('2014'))! });
const goblin = withSheet({ ...token('goblin', 150, 50), ownership: undefined, monster: 'goblin' });
const hero = withSheet({
  ...token('hero'),
  stats: { class: 'fighter', level: 1, maxHp: 12, abilities: { str: 16 } },
});

/** Unarmoured and next to the goblin, but not in the fight. */
const bystander = withSheet({
  ...token('bystander', 150, 150),
  stats: { class: 'wizard', level: 1, maxHp: 6, abilities: { dex: 8 } },
});

function join(role: 'gm' | 'player'): void {
  const hello = welcome([goblin, hero, bystander]);
  if (hello.t !== 'welcome') throw new Error('not a welcome');
  ws.receive({ ...hello, you: { id: role, name: role, role, color: '#fc0' } });
  ws.receive({ t: 'combat', combat: fight(0) });
}

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

describe('the turn helper at the table', () => {
  it('shows the GM what the monster whose turn it is does best', () => {
    join('gm');
    const shown = turnAdvice(session);
    expect(shown?.mover.id).toBe('goblin');
    expect(shown?.target.id).toBe('hero');
    expect(shown?.advice.attack).toBe('Scimitar');
  });

  it('aims only at creatures in the fight', () => {
    join('gm');
    expect(turnAdvice(session)?.target.id).toBe('hero');
    const combat = fight(0);
    ws.receive({ t: 'combat', combat: { ...combat, order: [...combat.order, { token: 'bystander', initiative: 1 }] } });
    expect(turnAdvice(session)?.target.id).toBe('bystander');
  });

  it('says nothing to players, on a party member’s turn, or outside a fight', () => {
    join('player');
    expect(turnAdvice(session)).toBeUndefined();
    ws.receive({ t: 'combat', combat: null });
    expect(turnAdvice(session)).toBeUndefined();
  });

  it('says nothing on a party member’s turn', () => {
    join('gm');
    ws.receive({ t: 'combat', combat: fight(1) });
    expect(turnAdvice(session)).toBeUndefined();
  });

  it('says nothing once the monster has spent its action', () => {
    join('gm');
    const combat = fight(0);
    ws.receive({ t: 'combat', combat: { ...combat, left: { ...combat.left, action: false } } });
    expect(turnAdvice(session)).toBeUndefined();
  });

  it('takes it in one click: the monster attacks its target', () => {
    join('gm');
    takeAdvice(session, turnAdvice(session)!);
    expect(ws.sent.at(-1)).toMatchObject({ t: 'attack', attacker: 'goblin', target: 'hero', attack: 'Scimitar' });
  });
});

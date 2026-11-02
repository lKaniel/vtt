import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// Targets, roll modes and applying chat rolls (session-actions.ts).

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

describe('Session actions', () => {
  it('tells the server its roll mode on joining and when it changes', () => {
    ws.receive(welcome());
    expect(ws.sent).toContainEqual({ t: 'rollMode', mode: 'public' });
    session.setRollMode('blind');
    expect(session.rollMode).toBe('blind');
    expect(ws.sent.at(-1)).toEqual({ t: 'rollMode', mode: 'blind' });
  });

  it('forgets a target that is gone, and keeps the rest when it starts over', () => {
    ws.receive(welcome([token('hero'), token('goblin'), token('orc')]));
    session.targets.toggle('goblin');
    ws.receive({ t: 'tokenGone', id: 'goblin' });
    expect(session.targets.mine.size).toBe(0);
    session.targets.toggle('hero');
    session.targets.toggle('orc');
    ws.receive(welcome([token('hero')]));
    expect([...session.targets.mine]).toEqual(['hero']);
    expect(ws.sent).toContainEqual({ t: 'target', tokens: ['hero'] });
  });

  it('targets the creature under the pointer with T, and lets them all go over empty ground', () => {
    ws.receive(welcome([token('hero'), token('goblin', 250, 50)]));
    session.pointer = [240, 60];
    expect(session.toggleTargetAtPointer()).toBe(true);
    expect([...session.targets.mine]).toEqual(['goblin']);
    session.pointer = [650, 650];
    expect(session.toggleTargetAtPointer()).toBe(true);
    expect(session.targets.mine.size).toBe(0);
    expect(session.toggleTargetAtPointer()).toBe(false);
  });

  it('applies a chat roll to your targets, else the selected creatures', () => {
    ws.receive(welcome([token('hero'), token('goblin', 250, 50)]));
    session.applyRoll('card', 'half');
    expect(ws.sent.at(-1)).not.toMatchObject({ t: 'applyDamage' });
    expect(session.error?.message).toMatch(/target or select/i);
    session.select('hero');
    session.applyRoll('card', 'heal');
    expect(ws.sent.at(-1)).toEqual({ t: 'applyDamage', card: 'card', tokens: ['hero'], how: 'heal' });
    session.targets.toggle('goblin');
    session.applyRoll('card', 'half');
    expect(ws.sent.at(-1)).toEqual({ t: 'applyDamage', card: 'card', tokens: ['goblin'], how: 'half' });
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// The token HUD (session-hud.ts) and the GM's pause.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

describe('Token HUD', () => {
  it('opens beside a creature you control and closes when it goes', () => {
    ws.receive(welcome([token('hero'), { ...token('goblin'), ownership: { default: 'limited' } }]));
    session.openHud('goblin', [10, 20]);
    expect(session.hud).toBeUndefined();
    session.openHud('hero', [10, 20]);
    expect(session.hud).toEqual({ token: 'hero', screen: [10, 20] });
    session.closeHud();
    expect(session.hud).toBeUndefined();
    session.openHud('hero', [10, 20]);
    ws.receive({ t: 'tokenGone', id: 'hero' });
    expect(session.hud).toBeUndefined();
  });

  it('puts conditions on, adds to the fight and edits fields', () => {
    ws.receive(welcome());
    session.setCondition('hero', 'prone', true);
    expect(ws.sent.at(-1)).toEqual({ t: 'condition', token: 'hero', condition: 'prone', on: true });
    session.setCombatant('hero', false);
    expect(ws.sent.at(-1)).toEqual({ t: 'combatant', token: 'hero', on: false });
    session.editToken('hero', { elevation: 10 });
    expect(ws.sent.at(-1)).toEqual({ t: 'editToken', token: 'hero', patch: { elevation: 10 } });
  });

  it('knows when the GM paused the game', () => {
    ws.receive({ ...welcome(), paused: true } as never);
    expect(session.paused).toBe(true);
    ws.receive({ t: 'paused', on: false });
    expect(session.paused).toBe(false);
    session.setPaused(true);
    expect(ws.sent.at(-1)).toEqual({ t: 'pause', on: true });
  });
});

describe('Observe as', () => {
  const asGm = () => {
    const w = welcome([token('hero'), token('goblin')]) as Extract<ReturnType<typeof welcome>, { t: 'welcome' }>;
    return { ...w, you: { ...w.you, role: 'gm' as const } };
  };

  it('lets the GM see through one creature’s eyes until they stop or it goes', () => {
    ws.receive(asGm());
    session.observe('goblin');
    expect(session.observing).toBe('goblin');
    session.observe(undefined);
    expect(session.observing).toBeUndefined();
    session.observe('goblin');
    ws.receive({ t: 'tokenGone', id: 'goblin' });
    expect(session.observing).toBeUndefined();
  });

  it('is only for the GM', () => {
    ws.receive(welcome());
    session.observe('hero');
    expect(session.observing).toBeUndefined();
  });
});

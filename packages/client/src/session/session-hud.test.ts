import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

// The token HUD (session-hud.ts, `session.hud`) and the GM's pause.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

describe('Token HUD', () => {
  it('opens beside a creature you control and closes when it goes', () => {
    ws.receive(welcome([token('hero'), { ...token('goblin'), ownership: { default: 'limited' } }]));
    session.hud.open('goblin', [10, 20]);
    expect(session.hud.current).toBeUndefined();
    session.hud.open('hero', [10, 20]);
    expect(session.hud.current).toEqual({ token: 'hero', screen: [10, 20] });
    session.hud.close();
    expect(session.hud.current).toBeUndefined();
    session.hud.open('hero', [10, 20]);
    ws.receive({ t: 'tokenGone', id: 'hero' });
    expect(session.hud.current).toBeUndefined();
  });

  it('puts conditions on, adds to the fight and edits fields', () => {
    ws.receive(welcome());
    session.hud.setCondition('hero', 'prone', true);
    expect(ws.sent.at(-1)).toEqual({ t: 'condition', token: 'hero', condition: 'prone', on: true });
    session.hud.setCombatant('hero', false);
    expect(ws.sent.at(-1)).toEqual({ t: 'combatant', token: 'hero', on: false });
    session.hud.setInitiative('hero', 17);
    expect(ws.sent.at(-1)).toEqual({ t: 'initiative', token: 'hero', value: 17 });
    session.requests.editToken('hero', { elevation: 10 });
    expect(ws.sent.at(-1)).toEqual({ t: 'editToken', token: 'hero', patch: { elevation: 10 } });
  });

  it('knows when the GM paused the game', () => {
    ws.receive({ ...welcome(), paused: true } as never);
    expect(session.paused).toBe(true);
    ws.receive({ t: 'paused', on: false });
    expect(session.paused).toBe(false);
    session.requests.setPaused(true);
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
    session.hud.observe('goblin');
    expect(session.hud.observing).toBe('goblin');
    session.hud.observe(undefined);
    expect(session.hud.observing).toBeUndefined();
    session.hud.observe('goblin');
    ws.receive({ t: 'tokenGone', id: 'goblin' });
    expect(session.hud.observing).toBeUndefined();
  });

  it('is only for the GM', () => {
    ws.receive(welcome());
    session.hud.observe('hero');
    expect(session.hud.observing).toBeUndefined();
  });
});

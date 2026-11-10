import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, fight, openSession, token, welcome, type FakeWebSocket } from './session.fixtures.ts';

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

  it('lets a trusted seat, not a plain player, override the turns of what it controls', () => {
    const trusted = welcome([token('hero'), { ...token('goblin'), ownership: { default: 'limited' } }]);
    ws.receive(welcome());
    expect(session.hud.canOverride('hero')).toBe(false);
    ws.receive({ ...trusted, you: { id: 'ana', name: 'Ana', role: 'trusted', color: '#f00' } } as never);
    expect(session.hud.canOverride('hero')).toBe(true);
    expect(session.hud.canOverride('goblin')).toBe(false);
    session.hud.overrideTurn('hero', { action: true, move: 60 });
    expect(ws.sent.at(-1)).toEqual({ t: 'turnOverride', token: 'hero', action: true, move: 60 });
  });

  it('reads what a creature has left of its turn: budget on its turn, its reaction all round', () => {
    ws.receive({
      ...welcome([token('hero'), token('goblin')]),
      combat: { ...fight(1, 25), reacted: ['goblin'] },
    } as never);
    expect(session.hud.turnOf('hero')).toEqual({ budget: fight(1, 25).left, reaction: true });
    expect(session.hud.turnOf('goblin')).toEqual({ budget: undefined, reaction: false });
    expect(session.hud.turnOf('nobody')).toBeUndefined();
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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';

// What a seat picks for itself: its automation settings and its animations.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

describe('Session seat choices', () => {
  it('sends the animation picked for an attack, and none for the default', () => {
    ws.receive(welcome());
    session.requests.setAnimation('hero', 'attack:Dagger', 'flame-blade');
    expect(ws.sent.at(-1)).toEqual({ t: 'animation', token: 'hero', ref: 'attack:Dagger', animation: 'flame-blade' });
    session.requests.setAnimation('hero', 'attack:Dagger');
    expect(ws.sent.at(-1)).toEqual({ t: 'animation', token: 'hero', ref: 'attack:Dagger' });
  });

  it('sends the GM’s game settings', () => {
    ws.receive(welcome());
    session.requests.setGameSettings('2024', { encumbrance: 'variant' });
    expect(ws.sent.at(-1)).toEqual({ t: 'gameSettings', rules: '2024', settings: { encumbrance: 'variant' } });
  });

  it('sends your settings and takes your changed seat without starting over', () => {
    ws.receive(welcome());
    session.requests.setSeatSettings({ opportunity: 'auto' });
    expect(ws.sent.at(-1)).toEqual({ t: 'seatSettings', settings: { opportunity: 'auto' } });
    ws.receive({ t: 'you', you: { ...session.you!, settings: { opportunity: 'auto' } } });
    expect(session.you?.settings).toEqual({ opportunity: 'auto' });
  });
});

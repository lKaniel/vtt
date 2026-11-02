import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';

// Tile triggers on the client: clicking a tile asks the server to run it,
// and the sounds triggers play come in as events for the sound scape.

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

describe('Session tile triggers', () => {
  it('clicks a tile with the creature you act with, or none', () => {
    ws.receive(welcome());
    session.useTile('lever', 'hero');
    expect(ws.sent.at(-1)).toEqual({ t: 'trigger', tile: 'lever', token: 'hero' });
    session.useTile('lever');
    expect(ws.sent.at(-1)).toEqual({ t: 'trigger', tile: 'lever' });
  });

  it('passes on the sounds triggers play', () => {
    ws.receive(welcome());
    const heard = vi.fn();
    session.on('sound', heard);
    ws.receive({ t: 'sound', src: '/assets/clunk.ogg', volume: 0.5 });
    ws.receive({ t: 'sound', src: '/assets/bell.ogg' });
    expect(heard.mock.calls).toEqual([
      ['/assets/clunk.ogg', 0.5],
      ['/assets/bell.ogg', 1],
    ]);
  });
});

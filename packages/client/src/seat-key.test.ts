import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetSeatKey, rememberSeatKey, seatKey } from './seat-key.ts';
import { openSocket, refusalOf } from './session-socket.ts';

// A fixed seat's password, kept for this tab and sent with the connection.

class Socket {
  constructor(readonly url: string) {}
}

beforeEach(() => {
  const kept = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => kept.get(k) ?? null,
    setItem: (k: string, v: string) => kept.set(k, v),
    removeItem: (k: string) => kept.delete(k),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('seat passwords', () => {
  it('go with the connection to that seat', () => {
    rememberSeatKey('ana', 'se cret');
    expect(seatKey('ana')).toBe('se cret');
    const ws = openSocket({ protocol: 'http:', host: 'table' }, undefined, 'ana', Socket as never) as unknown as Socket;
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- the page was loaded over http
    expect(ws.url).toBe('ws://table/ws?player=ana&key=se+cret');
    forgetSeatKey('ana');
    expect(seatKey('ana')).toBeUndefined();
  });

  it('say so when the password was wrong', () => {
    expect(refusalOf(4003)).toMatch(/password/);
  });
});

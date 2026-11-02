import { describe, expect, it } from 'vitest';
import { openSocket, refusalOf } from './session-socket.ts';

class Socket {
  constructor(readonly url: string) {}
}

describe('the game connection', () => {
  it('goes to the game asked for, signed in by the session cookie', () => {
    const ws = openSocket({ protocol: 'https:', host: 'table' }, 'lost mine', Socket as never) as unknown as Socket;
    expect(ws.url).toBe('wss://table/ws?game=lost+mine');
  });

  it('says why it was turned away', () => {
    expect(refusalOf(4001)).toMatch(/join screen/);
    expect(refusalOf(1006)).toBeUndefined();
  });
});

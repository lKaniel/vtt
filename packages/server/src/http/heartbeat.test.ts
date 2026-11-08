import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { beat } from './heartbeat.ts';

class Peer extends EventEmitter {
  pings = 0;
  ended = false;
  ping(): void {
    this.pings++;
  }
  terminate(): void {
    this.ended = true;
  }
}

describe('the heartbeat', () => {
  it('pings every connection and drops one that stopped answering', () => {
    const live = new Peer();
    const dead = new Peer();
    const peers = new Set([live, dead]);
    beat(peers);
    live.emit('pong');
    beat(peers);
    expect(live.ended).toBe(false);
    expect(dead.ended).toBe(true);
    expect(live.pings).toBe(2);
  });
});

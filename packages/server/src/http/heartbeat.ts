// Game connections whose browser went away without closing (a laptop shut,
// the network gone) would hold a player's seat for good, since a seat is one
// browser's at a time. Every beat pings each connection and drops one that
// didn't answer the last ping.

/** A connection that answers pings: a `ws` WebSocket. */
export interface Peer {
  ping(): void;
  terminate(): void;
  on(event: 'pong', fn: () => void): unknown;
}

const answered = new WeakMap<Peer, boolean>();

/** One beat: drops the connections that missed the last ping, pings the rest. */
export function beat(peers: Iterable<Peer>): void {
  for (const peer of peers) {
    if (answered.get(peer) === false) {
      peer.terminate();
      continue;
    }
    if (!answered.has(peer)) peer.on('pong', () => answered.set(peer, true));
    answered.set(peer, false);
    peer.ping();
  }
}

/** Beats every `ms` over the server's connections until the returned stop is called. */
export function startHeartbeat(peers: () => Iterable<Peer>, ms = 30_000): () => void {
  const timer = setInterval(() => beat(peers()), ms);
  timer.unref();
  return () => clearInterval(timer);
}

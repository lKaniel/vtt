import type { Player } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import type { WebSocket } from 'ws';
import type { DocFeed } from './doc-feed.ts';
import type { GameStore } from './game-store.ts';

// A connection to the live game (game.ts), and what it is sent as its camera moves.

/** One connected client: its seat, scene, what it looks at and what it knows. */
export interface Client {
  ws: WebSocket;
  player: Player;
  /** The scene this client is on (see scene-actions.ts). */
  scene: string;
  /** What the client was last welcomed with, to tell when it needs a fresh welcome. */
  start: string;
  /** Chunks this client is looking at. */
  chunks: Set<string>;
  /** Tokens this client currently knows about. */
  visible: Set<string>;
  /** The documents this client has (see doc-feed.ts). */
  feed: DocFeed;
  /** Its ruler is out, shown to the others on its scene (see rulers.ts). */
  ruler?: boolean;
}

/** The chunks this client's camera can see now: those it didn't have yet are sent (empty ones too, so it knows the area is loaded). */
export function streamChunks(c: Client, chunks: string[], store: GameStore, send: (msg: ServerMessage) => void): void {
  const next = new Set(chunks);
  for (const key of next) {
    if (c.chunks.has(key)) continue;
    send({ t: 'chunk', key, chunk: store.chunks.get(key) ?? { tiles: [], walls: [], lights: [] } });
  }
  c.chunks = next;
}

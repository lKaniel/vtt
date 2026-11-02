import { type Chunk, chunkFor, isGm, type Player, type Point, type RollMode } from '@vtt/shared';
import { type ServerMessage, type Token, viewToken } from '@vtt/system-dnd5e';
import type { WebSocket } from 'ws';
import type { DocFeed } from './doc-feed.ts';
import type { GameStore } from './game-store.ts';
import { contentFor } from './game-packs.ts';

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
  /** Its ruler is out, shown to the others on its scene (see presence.ts). */
  ruler?: boolean;
  /** Its cursor is on the map, shown to the others on its scene. */
  cursor?: boolean;
  /** The tokens it targets, shown to the others on its scene. */
  targets?: string[];
  /** Who sees its rolls and the cards of its actions (see roll-modes.ts); none: everyone. */
  rollMode?: RollMode;
}

/** The chunks this client's camera can see now: those it didn't have yet are sent (empty ones too, so it knows the area is loaded). */
export function streamChunks(c: Client, chunks: string[], store: GameStore, send: (msg: ServerMessage) => void): void {
  const next = new Set(chunks);
  for (const key of next) {
    if (c.chunks.has(key)) continue;
    send(chunkMessage(c, key, store.chunks.get(key)));
  }
  c.chunks = next;
}

/**
 * A map chunk as its message to one player: secret doors kept from all but the
 * GM. A chunk with nothing in it is sent too, so the client knows the area is loaded.
 */
export function chunkMessage(to: { player: Player }, key: string, chunk: Chunk | undefined): ServerMessage {
  return { t: 'chunk', key, chunk: chunkFor(chunk ?? { tiles: [], walls: [], lights: [] }, isGm(to.player)) };
}

/** A token as `player` may see it. */
export function viewFor(store: GameStore, token: Token, player: Player) {
  return viewToken(token, player, contentFor(store, token));
}

/** What a client is told after what it may see changed: tokens gone, new, or `changed` (walked along `path`). */
export function visibilityChanges(
  store: GameStore,
  c: Client,
  before: Set<string>,
  { changed, path }: { changed?: string; path?: Point[] },
): ServerMessage[] {
  const out: ServerMessage[] = [];
  for (const id of before) if (!c.visible.has(id)) out.push({ t: 'tokenGone', id });
  for (const id of c.visible) {
    const token = viewFor(store, store.tokens.get(id)!, c.player);
    if (!before.has(id)) out.push({ t: 'token', token });
    else if (id === changed) out.push(path ? { t: 'moved', id, path } : { t: 'token', token });
  }
  return out;
}

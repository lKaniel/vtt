import type { IncomingMessage } from 'node:http';
import { isGm, type Player } from '@vtt/shared';
import type { GameHub } from './library/game-hub.ts';
import { sessionToken } from './http/http-json.ts';
import type { SessionStore } from './http/sessions.ts';

/**
 * Who a WebSocket upgrade is for, and at which game: `?game=` (the home game
 * by default), as the player this browser joined it as on its join screen
 * (sessions.ts). Loads the game if it isn't yet. A player's seat is one
 * browser's at a time: `taken` when another browser plays it now (the GM's
 * seat may be open in several).
 */
export async function socketSeat(
  req: IncomingMessage,
  { sessions, hub }: { sessions: Pick<SessionStore, 'seatIn'>; hub: GameHub },
): Promise<SocketSeat | undefined> {
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const game = params.get('game') ?? hub.homeId;
  if (!game || !hub.has(game)) return undefined;
  const session = sessionToken(req);
  const id = sessions.seatIn(session, game);
  if (!id) return undefined;
  const player = (await hub.open(game)).game.findPlayer(id);
  if (!player) return undefined;
  const taken = !isGm(player) && hub.heldElsewhere(game, player.id, session);
  return { game, player, session, taken };
}

export interface SocketSeat {
  game: string;
  player: Player;
  /** The browser's session token. */
  session?: string;
  /** Someone else plays this seat from another browser right now. */
  taken: boolean;
}

import type { IncomingMessage } from 'node:http';
import type { Player } from '@vtt/shared';
import type { GameHub } from './library/game-hub.ts';
import { sessionToken } from './http/http-json.ts';
import type { SessionStore } from './http/sessions.ts';

/**
 * Who a WebSocket upgrade is for, and at which game: `?game=` (the home game
 * by default), as the player this browser joined it as on its join screen
 * (sessions.ts). Loads the game if it isn't yet.
 */
export async function socketSeat(
  req: IncomingMessage,
  { sessions, hub }: { sessions: Pick<SessionStore, 'seatIn'>; hub: GameHub },
): Promise<{ game: string; player: Player } | undefined> {
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const game = params.get('game') ?? hub.homeId;
  if (!game || !hub.has(game)) return undefined;
  const id = sessions.seatIn(sessionToken(req), game);
  if (!id) return undefined;
  const player = (await hub.open(game)).game.findPlayer(id);
  return player && { game, player };
}

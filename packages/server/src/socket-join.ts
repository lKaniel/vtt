import type { IncomingMessage } from 'node:http';
import type { Player } from '@vtt/shared';
import type { AccountStore } from './accounts.ts';
import type { GameHub } from './game-hub.ts';
import { sessionToken } from './http-json.ts';

/**
 * Who a WebSocket upgrade is for, and at which game: `?game=` (the home game
 * by default), as the signed-in account. `?player=` sits at one of the home
 * game's fixed seats without an account, the old way in; other games need
 * the account's own seat. Loads the game if it isn't yet.
 */
export async function socketSeat(
  req: IncomingMessage,
  { accounts, hub }: { accounts: Pick<AccountStore, 'sessionAccount'>; hub: GameHub },
): Promise<{ game: string; player: Player } | undefined> {
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const game = params.get('game') ?? hub.homeId;
  if (!game || !hub.has(game)) return undefined;
  const fixed = game === hub.homeId ? params.get('player') : null;
  const id = fixed ?? accounts.sessionAccount(sessionToken(req))?.id;
  if (!id) return undefined;
  const player = (await hub.open(game)).game.findPlayer(id);
  return player && { game, player };
}

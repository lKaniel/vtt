import { setAssetGame } from './assets.ts';

// The game connection: its address, and the ways the server can turn it away.

/** /ws on this server, for `game` (else the home game) and a fixed home game seat if given. */
function socketUrl(page: Pick<Location, 'protocol' | 'host'>, game?: string, seat?: string): string {
  const proto = page.protocol === 'https:' ? 'wss' : 'ws';
  const query = new URLSearchParams();
  if (game) query.set('game', game);
  if (seat) query.set('player', seat);
  const search = query.size ? `?${query.toString()}` : '';
  return `${proto}://${page.host}/ws${search}`;
}

/** Connects to `game`; its pictures come from that game's assets from now on. */
export function openSocket(page: Pick<Location, 'protocol' | 'host'>, game?: string, seat?: string): WebSocket {
  setAssetGame(game);
  return new WebSocket(socketUrl(page, game, seat));
}

/** Close codes that mean "don't come back", with what to tell the player. */
const REFUSALS: Record<number, string> = {
  4000: 'Your seat at this game is gone: the GM removed it.',
  4001: 'You have no seat at this game. Join again from the lobby.',
  4004: 'This game was deleted.',
};

export function refusalOf(code: number): string | undefined {
  return REFUSALS[code];
}

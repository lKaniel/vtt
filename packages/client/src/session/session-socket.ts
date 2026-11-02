import { setAssetGame } from '../assets.ts';

// The game connection: its address, and the ways the server can turn it away.

/** /ws on this server, for `game` (else the home game); the session cookie says which player. */
function socketUrl(page: Pick<Location, 'protocol' | 'host'>, game?: string): string {
  const proto = page.protocol === 'https:' ? 'wss' : 'ws';
  const search = game ? `?${new URLSearchParams({ game }).toString()}` : '';
  return `${proto}://${page.host}/ws${search}`;
}

/** Connects to `game`; its pictures come from that game's assets from now on. */
export function openSocket(
  page: Pick<Location, 'protocol' | 'host'>,
  game?: string,
  Socket: new (url: string) => WebSocket = WebSocket,
): WebSocket {
  setAssetGame(game);
  return new Socket(socketUrl(page, game));
}

/** Close codes that mean "don't come back", with what to tell the player. */
const REFUSALS: Record<number, string> = {
  4000: 'Your player at this game is gone: the GM removed it.',
  4001: 'You have not joined this game. Pick your player on its join screen.',
  4004: 'This game was deleted.',
};

export function refusalOf(code: number): string | undefined {
  return REFUSALS[code];
}

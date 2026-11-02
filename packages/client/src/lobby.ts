import type { GameSummary } from '@vtt/shared';
import type { Route } from './route.ts';

// Small pieces of the games screens (ui/MenuScreens.tsx, ui/LobbyScreens.tsx).

/** Where a game's card leads: its page once you joined it, else its join screen. */
export function gameRoute(g: Pick<GameSummary, 'id' | 'you'>): Route {
  return g.you ? { name: 'game', game: g.id } : { name: 'join', game: g.id };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function lastPlayedText(at: number | undefined, now: number): string {
  if (!at) return 'Not played yet';
  const ago = now - at;
  if (ago < HOUR) return 'Played just now';
  if (ago < DAY) return `Played ${Math.floor(ago / HOUR)} hour${ago < 2 * HOUR ? '' : 's'} ago`;
  if (ago < 2 * DAY) return 'Played yesterday';
  return `Played ${Math.floor(ago / DAY)} days ago`;
}

// Small pieces of the lobby screens (ui/LobbyScreens.tsx).

/** Where an invite opened before signing in waits, so signing in can carry on with it. */
export const PENDING_INVITE = 'vtt_invite';

/** The link to share for an invite code: this server's page, on the invite route. */
export function inviteLink(href: string, code: string): string {
  const url = new URL(href);
  return `${url.origin}/#/invite/${code}`;
}

/** The code in a pasted invite link, or the text itself when it is just the code. */
export function inviteCode(text: string): string {
  const trimmed = text.trim();
  return /#\/invite\/([^/?#\s]+)/.exec(trimmed)?.[1] ?? trimmed;
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

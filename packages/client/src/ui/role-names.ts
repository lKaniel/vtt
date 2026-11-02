import type { Role } from '@vtt/shared';

/** How each role reads on screen, and what it lets a seat do. */
export const ROLE_NAMES: Record<Role, { name: string; about: string }> = {
  gm: { name: 'Game master', about: 'Runs the table: sees and edits everything.' },
  trusted: { name: 'Trusted player', about: 'Plays and edits the sheets of the tokens they own.' },
  player: { name: 'Player', about: 'Plays the tokens they own.' },
  observer: { name: 'Observer', about: "Watches through the party's eyes; acts on nothing." },
};

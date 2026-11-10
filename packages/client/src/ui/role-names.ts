import type { Role } from '@vtt/shared';

/** How each role reads on screen, and what it lets a seat do. */
export const ROLE_NAMES: Record<Role, { name: string; about: string }> = {
  gm: { name: 'Game master', about: 'Runs the table: sees and edits everything.' },
  trusted: {
    name: 'Trusted player',
    about: 'A player who may also change their creature’s size, senses and light, and override its turns in a fight.',
  },
  player: { name: 'Player', about: 'Plays the tokens they own and edits their sheets.' },
  observer: { name: 'Observer', about: "Watches through the party's eyes; acts on nothing." },
};

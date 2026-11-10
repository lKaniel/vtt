import { passiveScore } from './checks.ts';
import type { Creature } from './creature.ts';
import type { Token } from './token-schema.ts';

// Surprise at the start of a fight: a creature that notices no threat (every
// foe in the fight hides beyond its passive Perception), or one the GM names.
// 2014: it can't move or act on its first turn, nor react until that turn
// ends. 2024: it rolls initiative with disadvantage instead.

export interface SurpriseSide {
  token: Token;
  sheet: Creature;
  /** Which side it fights on (the party, or not). */
  party: boolean;
}

/** How well it hides: its best Stealth total, or undefined when it doesn't. */
function stealthOf(token: Token): number | undefined {
  const totals = (token.effects ?? []).flatMap((e) => (e.hidden === undefined ? [] : [e.hidden]));
  return totals.length ? Math.max(...totals) : undefined;
}

/** The creatures that notice none of their foes in the fight. */
export function unawareOf(fighters: readonly SurpriseSide[]): string[] {
  return fighters
    .filter((me) => {
      const foes = fighters.filter((f) => f.party !== me.party);
      const notices = passiveScore(me.token, me.sheet, 'perception');
      return foes.length > 0 && foes.every((f) => (stealthOf(f.token) ?? -Infinity) > notices);
    })
    .map((f) => f.token.id);
}

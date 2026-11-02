import { tokenDistance } from './attack.ts';
import type { Creature } from './creature.ts';
import { canAct } from './effects.ts';
import { type GridKind, isParty, type Point } from '@vtt/shared';
import type { Token } from './token-schema.ts';

// Reactions: what a creature may do out of turn, once between its own
// turns. Opportunity attacks come from enemies whose reach a creature leaves.

const onSide = (t: Pick<Token, 'ownership'>) => isParty(t);

/** How far a creature's melee attacks reach, or 0 without any. */
export function meleeReach(sheet: Creature): number {
  return Math.max(0, ...sheet.attacks.filter((a) => a.kind === 'melee').map((a) => a.reach ?? 5));
}

interface Scale {
  gridSize: number;
  /** The scene's grid (none: reach is measured as the crow flies). */
  grid?: GridKind;
}

/** An enemy that may strike a creature leaving its reach. */
export interface Threat {
  token: Token;
  /** How far its melee attacks reach, in feet. */
  reach: number;
}

/**
 * Where a walk along `path` leaves the reach of each enemy in `threats` it
 * starts next to: the enemies that may make an opportunity attack, with the
 * first point out of reach. None for a creature that disengaged.
 */
export function threatsAlong({
  mover,
  path,
  threats,
  ...scale
}: { mover: Token; path: readonly Point[]; threats: readonly Threat[] } & Scale): { id: string; at: Point }[] {
  if (path.length < 2 || mover.effects?.some((e) => e.disengaged)) return [];
  const within = (o: Token, [x, y]: Point, reach: number) =>
    tokenDistance(o, { ...mover, x, y }, scale.gridSize, scale.grid) <= reach;
  return threats.flatMap(({ token, reach }) => {
    if (token.id === mover.id || onSide(token) === onSide(mover) || reach <= 0) return [];
    if (!within(token, path[0]!, reach)) return [];
    const out = path.find((p) => !within(token, p, reach));
    return out ? [{ id: token.id, at: out }] : [];
  });
}

/** The enemies that may make an opportunity attack as `mover` walks `path`. */
export function opportunityAttackers({
  mover,
  path,
  others,
  reacted,
  ...scale
}: {
  mover: Token;
  path: readonly Point[];
  others: readonly { token: Token; sheet: Creature }[];
  /** Creatures that already used their reaction this round. */
  reacted: readonly string[];
} & Scale): string[] {
  const threats = others
    .filter(({ token, sheet }) => sheet.hp > 0 && canAct(sheet) && !reacted.includes(token.id))
    .map(({ token, sheet }) => ({ token, reach: meleeReach(sheet) }));
  return threatsAlong({ mover, path, threats, ...scale }).map((t) => t.id);
}

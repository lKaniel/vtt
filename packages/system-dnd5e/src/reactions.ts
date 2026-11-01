import { tokenDistance } from './attack.ts';
import type { Creature } from './creature.ts';
import { canAct } from './effects.ts';
import { isParty, type Point } from '@vtt/shared';
import type { Token } from './token-schema.ts';

// Reactions: what a creature may do out of turn, once between its own
// turns. Opportunity attacks come from enemies whose reach a creature leaves.

const onSide = (t: Pick<Token, 'ownership'>) => isParty(t);

/** How far a creature's melee attacks reach, or 0 without any. */
function reachOf(sheet: Creature): number {
  return Math.max(0, ...sheet.attacks.filter((a) => a.kind === 'melee').map((a) => a.reach ?? 5));
}

/** The enemies that may make an opportunity attack as `mover` walks `path`. */
export function opportunityAttackers({
  mover,
  path,
  others,
  gridSize,
  gridless,
  reacted,
}: {
  mover: Token;
  path: readonly Point[];
  others: readonly { token: Token; sheet: Creature }[];
  gridSize: number;
  /** The scene has no grid: reach is measured as the crow flies. */
  gridless?: boolean;
  /** Creatures that already used their reaction this round. */
  reacted: readonly string[];
}): string[] {
  if (path.length < 2 || mover.effects?.some((e) => e.disengaged)) return [];
  const within = (o: Token, [x, y]: Point, reach: number) =>
    tokenDistance(o, { ...mover, x, y }, gridSize, gridless) <= reach;
  return others
    .filter(({ token }) => token.id !== mover.id && onSide(token) !== onSide(mover))
    .filter(({ token, sheet }) => sheet.hp > 0 && canAct(sheet) && !reacted.includes(token.id))
    .filter(({ token, sheet }) => {
      const reach = reachOf(sheet);
      return reach > 0 && within(token, path[0]!, reach) && path.some((p) => !within(token, p, reach));
    })
    .map(({ token }) => token.id);
}

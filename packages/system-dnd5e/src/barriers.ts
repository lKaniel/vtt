import type { GridKind, Point } from '@vtt/shared';
import { tokenDistance } from './attack.ts';
import type { Token } from './token-schema.ts';

// Barriers a creature can't push through (antilife shell): an effect with
// `barrier` keeps creatures of other kinds from walking within its radius of
// its bearer. Those already inside may stay or leave.

export interface BarrierWalk {
  mover: Token;
  /** The mover's creature type: some kinds pass (undead and constructs). */
  type: string;
  path: readonly Point[];
  others: readonly Token[];
  gridSize: number;
  grid?: GridKind;
}

/** The creature whose barrier stops this walk, or undefined when nothing does. */
export function barrierStops({ mover, type, path, others, gridSize, grid }: BarrierWalk): Token | undefined {
  const feet = (bearer: Token, [x, y]: Point) => tokenDistance(bearer, { ...mover, x, y }, gridSize, grid);
  return others.find((bearer) => {
    if (bearer.id === mover.id) return false;
    const barrier = bearer.effects?.find((e) => e.barrier && !e.barrier.except.includes(type))?.barrier;
    if (!barrier || !path.length || feet(bearer, path[0]!) <= barrier.radius) return false;
    return path.some((p) => feet(bearer, p) <= barrier.radius);
  });
}

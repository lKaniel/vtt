import { movementBlocked } from './geometry.ts';
import type { Point, Wall } from './schema.ts';

export interface ForcedMove {
  /** Where the push comes from (the caster or attacker). */
  from: Point;
  /** The creature's square centre now. */
  start: Point;
  /** Feet to move: positive pushes away from `from`, negative pulls toward it. */
  feet: number;
  gridSize: number;
  walls: readonly Wall[];
  /** Whether another creature stands on that square centre. */
  taken: (p: Point) => boolean;
}

/**
 * The squares a pushed or pulled creature slides through, starting where it
 * stands. It moves a square per 5 feet in a straight line from (or toward)
 * the source and stops early at a wall or another creature.
 */
export function forcedMove(m: ForcedMove): Point[] {
  const sign = Math.sign(m.feet);
  const dx = m.start[0] - m.from[0];
  const dy = m.start[1] - m.from[1];
  const major = Math.max(Math.abs(dx), Math.abs(dy));
  const path: Point[] = [m.start];
  if (major === 0 || sign === 0) return path;
  const dir: Point = [(sign * dx) / major, (sign * dy) / major];
  const steps = Math.abs(Math.round(m.feet / 5));
  for (let i = 1; i <= steps; i++) {
    const next: Point = [
      m.start[0] + Math.round(dir[0] * i) * m.gridSize,
      m.start[1] + Math.round(dir[1] * i) * m.gridSize,
    ];
    if (m.taken(next) || movementBlocked(path.at(-1)!, next, m.walls)) break;
    path.push(next);
  }
  return path;
}

import { snapToGrid, squareCentre, squareOf } from './pathfinding.ts';
import type { Point } from './schema.ts';
import { costFeet } from './walking.ts';

// The ruler: a line through waypoints that anyone can lay on the map to
// measure, shown live to everyone on the scene. Without a grid each leg is
// measured as the crow flies; on a square grid waypoints sit on square
// centres and every square entered is 5 ft, diagonals too. `cost` is
// difficult ground, the same as walking pays for (regions.ts).

export interface RulerOptions {
  gridSize: number;
  gridless: boolean;
  /** What walking through the ground around a point costs, times 5 ft: 2 for difficult ground. Default 1. */
  cost?: (p: Point) => number;
}

/** One stretch of the ruler, between two waypoints. */
export interface RulerLeg {
  from: Point;
  to: Point;
  /** Its length in whole feet. */
  feet: number;
  /** What walking it costs, in whole feet: more than `feet` across difficult ground. */
  cost: number;
}

export interface RulerMeasure {
  /** The waypoints as measured (on a grid: square centres, repeats dropped). */
  points: Point[];
  legs: RulerLeg[];
  /** The whole length in feet, rounded once from the exact sum. */
  feet: number;
  /** What walking the whole way costs, in feet. */
  cost: number;
}

/** Measures a ruler laid through `points`. */
export function measureRuler(points: readonly Point[], opts: RulerOptions): RulerMeasure {
  const pts = opts.gridless ? points.slice() : onSquares(points, opts.gridSize);
  const exact = pts.slice(1).map((to, i) => legOf(pts[i]!, to, opts));
  const sum = (key: 'feet' | 'cost') => Math.round(exact.reduce((s, l) => s + l[key], 0));
  const legs = exact.map((l) => ({ ...l, feet: Math.round(l.feet), cost: Math.round(l.cost) }));
  return { points: pts, legs, feet: sum('feet'), cost: sum('cost') };
}

/** Waypoints moved to their square's centre, a waypoint on the same square as the one before dropped. */
function onSquares(points: readonly Point[], gridSize: number): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const c = snapToGrid(p, gridSize);
    const last = out.at(-1);
    if (last?.[0] !== c[0] || last[1] !== c[1]) out.push(c);
  }
  return out;
}

function legOf(from: Point, to: Point, opts: RulerOptions): RulerLeg {
  if (opts.gridless) {
    const feet = (Math.hypot(to[0] - from[0], to[1] - from[1]) / opts.gridSize) * 5;
    return { from, to, feet, cost: opts.cost ? costFeet([from, to], opts.gridSize, opts.cost) : feet };
  }
  const entered = squaresEntered(from, to, opts.gridSize);
  const cost = opts.cost ?? (() => 1);
  return { from, to, feet: entered.length * 5, cost: entered.reduce((s, p) => s + 5 * cost(p), 0) };
}

/** The centres of the squares a straight leg between two square centres steps into, one square at a time. */
function squaresEntered(from: Point, to: Point, gridSize: number): Point[] {
  const [a, b] = [squareOf(from, gridSize), squareOf(to, gridSize)];
  const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  return Array.from({ length: n }, (_, i) => {
    const k = (i + 1) / n;
    return squareCentre([Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k)], gridSize);
  });
}

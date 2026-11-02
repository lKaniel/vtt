import { type Lattice, latticeOf } from './grid.ts';
import type { Point } from './schema.ts';
import { costFeet } from './walking.ts';

// The ruler: a line through waypoints that anyone can lay on the map to
// measure, shown live to everyone on the scene. Without a grid each leg is
// measured as the crow flies; on a grid waypoints sit on cell centres and
// every square (diagonals too) or hex entered is 5 ft. `cost` is
// difficult ground, the same as walking pays for (regions.ts).

export interface RulerOptions {
  gridSize: number;
  gridless: boolean;
  /** The cells on a grid: squares of gridSize (the default) or hexes. */
  lattice?: Lattice;
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
  const lattice = opts.lattice ?? latticeOf('square', opts.gridSize);
  const pts = opts.gridless ? points.slice() : onCells(points, lattice);
  const exact = pts.slice(1).map((to, i) => legOf(pts[i]!, to, { ...opts, lattice }));
  const sum = (key: 'feet' | 'cost') => Math.round(exact.reduce((s, l) => s + l[key], 0));
  const legs = exact.map((l) => ({ ...l, feet: Math.round(l.feet), cost: Math.round(l.cost) }));
  return { points: pts, legs, feet: sum('feet'), cost: sum('cost') };
}

/** Waypoints moved to their cell's centre, a waypoint on the same cell as the one before dropped. */
function onCells(points: readonly Point[], lattice: Lattice): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const c = lattice.centre(lattice.cellOf(p));
    const last = out.at(-1);
    if (last?.[0] !== c[0] || last[1] !== c[1]) out.push(c);
  }
  return out;
}

function legOf(from: Point, to: Point, opts: RulerOptions & { lattice: Lattice }): RulerLeg {
  if (opts.gridless) {
    const feet = (Math.hypot(to[0] - from[0], to[1] - from[1]) / opts.gridSize) * 5;
    return { from, to, feet, cost: opts.cost ? costFeet([from, to], opts.gridSize, opts.cost) : feet };
  }
  const { lattice } = opts;
  const entered = lattice.between(lattice.cellOf(from), lattice.cellOf(to)).map((c) => lattice.centre(c));
  const cost = opts.cost ?? (() => 1);
  return { from, to, feet: entered.length * 5, cost: entered.reduce((s, p) => s + 5 * cost(p), 0) };
}

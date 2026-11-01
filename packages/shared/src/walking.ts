import { distToSegment, movementBlocked, wallsInRect } from './geometry.ts';
import { MinHeap } from './min-heap.ts';
import { findPath, type Path, type PathOptions } from './pathfinding.ts';
import type { Point, Wall } from './schema.ts';

// Walking a token across a scene. Without a grid (the default) a token goes
// to the exact point, in a straight line when it can and around walls and
// other creatures when it can't, and the way is measured in feet. On a
// square grid it walks square to square, every square 5 ft.

/** A creature's footprint on the map: a circle, in pixels. */
export interface Body {
  x: number;
  y: number;
  r: number;
}

export interface WalkOptions extends PathOptions {
  /** True: walk anywhere, measured in feet. False: square to square. */
  gridless: boolean;
  /** The walker's own radius, in pixels. */
  radius: number;
  /** Other creatures: no one walks through them or stops inside them. */
  bodies: readonly Body[];
}

/** Room for rounding, in pixels: creatures may touch, not overlap. */
const EPS = 0.5;

/** Whether a scene is played without a grid: always, unless it asks for squares. */
export function isGridless(scene: { grid?: string }): boolean {
  return scene.grid !== 'square';
}

/** The footprint of a token `size` squares across standing at x, y. */
export function bodyOf(token: { x: number; y: number; size?: number }, gridSize: number): Body {
  return { x: token.x, y: token.y, r: ((token.size ?? 1) * gridSize) / 2 };
}

/** The way from `from` to `to`, or null when walls or creatures leave none. */
export function walkPath(from: Point, to: Point, walls: readonly Wall[], opts: WalkOptions): Path | null {
  if (!opts.gridless) {
    const blocked = (p: Point) => opts.bodies.some((b) => dist(p, [b.x, b.y]) < b.r - EPS);
    return findPath(from, to, walls, { ...opts, blocked });
  }
  const m = (opts.margin ?? 12) * opts.gridSize;
  const box = { x: Math.min(from[0], to[0]) - m, y: Math.min(from[1], to[1]) - m };
  const near = wallsInRect(walls, {
    ...box,
    w: Math.abs(from[0] - to[0]) + 2 * m,
    h: Math.abs(from[1] - to[1]) + 2 * m,
  });
  const walker = new Walker(from, near, opts);
  if (!walker.canStand(to)) return null;
  if (walker.clear(from, to)) return route([from, to], opts);
  const corners = new LatticeSearch(walker, from, to, opts).run();
  return (
    corners &&
    route(
      smooth(corners, (a, b) => walker.clear(a, b)),
      opts,
    )
  );
}

/** `points` with points added so no step is longer than `step`. */
export function densify(points: readonly Point[], step: number): Point[] {
  const out: Point[] = points.slice(0, 1);
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!];
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** What stands in a walker's way: walls, and creatures it doesn't already overlap. */
class Walker {
  private bodies: Body[];

  constructor(
    from: Point,
    private walls: readonly Wall[],
    private opts: WalkOptions,
  ) {
    // A creature stuck inside another may still step out of it.
    this.bodies = opts.bodies.filter((b) => this.free(from, b));
  }

  canStand(p: Point): boolean {
    return this.bodies.every((b) => this.free(p, b));
  }

  /** Whether the walker can go straight from a to b. */
  clear(a: Point, b: Point): boolean {
    if (movementBlocked(a, b, this.walls)) return false;
    return this.bodies.every((body) => distToSegment([body.x, body.y], a, b) >= body.r + this.opts.radius - EPS);
  }

  private free(p: Point, b: Body): boolean {
    return dist(p, [b.x, b.y]) >= b.r + this.opts.radius - EPS;
  }
}

/** Lattice cells packed into one number, for the heap and maps. */
const OFFSET = 32768;
const cellKey = ([i, j]: Point): number => (i + OFFSET) * 65536 + (j + OFFSET);
const cellOf = (k: number): Point => [Math.floor(k / 65536) - OFFSET, (k % 65536) - OFFSET];

const STEPS: readonly Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** A* over a half-square lattice anchored at the start, used when the straight way is blocked. */
class LatticeSearch {
  private cost = new Map<number, number>();
  private came = new Map<number, number>();
  private closed = new Set<number>();
  private open = new MinHeap();
  private step: number;
  private reach: number;
  private stepCost: (p: Point) => number;

  constructor(
    private walker: Walker,
    private from: Point,
    private to: Point,
    private opts: WalkOptions,
  ) {
    this.step = opts.gridSize / 2;
    this.reach = (opts.margin ?? 12) * opts.gridSize;
    this.stepCost = opts.cost ?? (() => 1);
  }

  /** Lattice points from the start to the last one before the goal, the goal appended; null when unreachable. */
  run(): Point[] | null {
    this.cost.set(cellKey([0, 0]), 0);
    this.open.push(cellKey([0, 0]), dist(this.from, this.to));
    for (let n = 0; this.open.size > 0 && n <= (this.opts.maxNodes ?? 20000); n++) {
      const k = this.open.pop();
      if (this.closed.has(k)) continue;
      this.closed.add(k);
      const p = this.at(cellOf(k));
      if (dist(p, this.to) <= this.step * 1.5 && this.walker.clear(p, this.to)) return [...this.trace(k), this.to];
      this.expand(k, p);
    }
    return null;
  }

  private at([i, j]: Point): Point {
    return [this.from[0] + i * this.step, this.from[1] + j * this.step];
  }

  private inBounds(p: Point): boolean {
    const { from, to, reach } = this;
    const within = (a: 0 | 1) => p[a] >= Math.min(from[a], to[a]) - reach && p[a] <= Math.max(from[a], to[a]) + reach;
    return within(0) && within(1);
  }

  private expand(k: number, p: Point): void {
    const [i, j] = cellOf(k);
    const base = this.cost.get(k)!;
    for (const [di, dj] of STEPS) {
      const nk = cellKey([i + di, j + dj]);
      const q = this.at([i + di, j + dj]);
      const c = base + dist(p, q) * this.stepCost([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
      if (c >= (this.cost.get(nk) ?? Infinity) || !this.inBounds(q) || !this.walker.clear(p, q)) continue;
      this.cost.set(nk, c);
      this.came.set(nk, k);
      this.open.push(nk, c + dist(q, this.to));
    }
  }

  private trace(goal: number): Point[] {
    const points: Point[] = [];
    for (let k: number | undefined = goal; k !== undefined; k = this.came.get(k)) points.push(this.at(cellOf(k)));
    return points.reverse();
  }
}

/** Drops corners the walker can cut straight past. */
function smooth(points: readonly Point[], clear: (a: Point, b: Point) => boolean): Point[] {
  const out: Point[] = [points[0]!];
  for (let i = 0; i < points.length - 1;) {
    let j = points.length - 1;
    while (j > i + 1 && !clear(points[i]!, points[j]!)) j--;
    out.push(points[j]!);
    i = j;
  }
  return out;
}

/** A path through `points`, its feet counted in quarter squares so difficult ground costs what it should. */
function route(points: Point[], opts: WalkOptions): Path {
  const cost = opts.cost ?? (() => 1);
  const fine = densify(points, opts.gridSize / 4);
  let px = 0;
  for (let i = 1; i < fine.length; i++) {
    const [a, b] = [fine[i - 1]!, fine[i]!];
    px += dist(a, b) * cost([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return { points, feet: Math.round((px / opts.gridSize) * 5) };
}

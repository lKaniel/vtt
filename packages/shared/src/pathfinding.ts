import type { Rect } from './chunks.ts';
import { movementBlocked, wallsInRect } from './geometry.ts';
import { type Lattice, latticeOf } from './grid.ts';
import { MinHeap } from './min-heap.ts';
import type { Point, Wall } from './schema.ts';

export interface PathOptions {
  gridSize: number;
  /** Give up after expanding this many squares. */
  maxNodes?: number;
  /** How far outside the start-goal box the search may wander, in squares. */
  margin?: number;
  /** What walking into the square around a point costs, times 5 ft: 2 for difficult ground. Default 1. */
  cost?: (p: Point) => number;
  /** Squares no one may walk into, by their centre: where other creatures stand. */
  blocked?: (p: Point) => boolean;
  /** The cells walked: squares of gridSize (the default) or hexes (grid.ts). */
  lattice?: Lattice;
}

export interface Path {
  /** Cell centres from start to goal, start included. */
  points: Point[];
  /** Distance in feet, every square (diagonals too) costing 5 ft, or more on difficult ground. */
  feet: number;
}

export function squareOf(p: Point, gridSize: number): Point {
  return [Math.floor(p[0] / gridSize), Math.floor(p[1] / gridSize)];
}

export function squareCentre(sq: Point, gridSize: number): Point {
  return [(sq[0] + 0.5) * gridSize, (sq[1] + 0.5) * gridSize];
}

/** Centre of the square that contains p. */
export function snapToGrid(p: Point, gridSize: number): Point {
  return squareCentre(squareOf(p, gridSize), gridSize);
}

/** The finite box of squares a search may visit, numbered row by row. */
class SearchBox {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;

  constructor(s: Point, t: Point, margin: number) {
    this.minX = Math.min(s[0], t[0]) - margin;
    this.minY = Math.min(s[1], t[1]) - margin;
    this.width = Math.max(s[0], t[0]) + margin - this.minX + 1;
    this.height = Math.max(s[1], t[1]) + margin - this.minY + 1;
  }

  contains([x, y]: Point): boolean {
    return x >= this.minX && y >= this.minY && x < this.minX + this.width && y < this.minY + this.height;
  }

  key([x, y]: Point): number {
    return (y - this.minY) * this.width + (x - this.minX);
  }

  square(key: number): Point {
    return [(key % this.width) + this.minX, Math.floor(key / this.width) + this.minY];
  }

  /** The box on the map, in pixels, with a cell to spare around it. */
  rect(lattice: Lattice): Rect {
    const [maxX, maxY] = [this.minX + this.width - 1, this.minY + this.height - 1];
    const corners = [
      [this.minX, this.minY],
      [maxX, this.minY],
      [this.minX, maxY],
      [maxX, maxY],
    ].map((c) => lattice.centre(c as Point));
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const [x, y] = [Math.min(...xs) - lattice.size, Math.min(...ys) - lattice.size];
    return { x, y, w: Math.max(...xs) + lattice.size - x, h: Math.max(...ys) + lattice.size - y };
  }
}

/**
 * A* over 5 ft cells (squares, or hexes) on an unbounded map. Moving
 * between two cell centres is allowed when the straight line between them
 * crosses no blocking wall. Returns null when the goal can't be reached.
 */
export function findPath(from: Point, to: Point, walls: readonly Wall[], opts: PathOptions): Path | null {
  const lattice = opts.lattice ?? latticeOf('square', opts.gridSize);
  const s = lattice.cellOf(from);
  const t = lattice.cellOf(to);
  if (s[0] === t[0] && s[1] === t[1]) return { points: [lattice.centre(s)], feet: 0 };
  if (opts.blocked?.(lattice.centre(t))) return null;

  const search = new Search(new SearchBox(s, t, opts.margin ?? 12), t, walls, { ...opts, lattice });
  search.start(s);
  for (let expanded = 0; search.hasOpen() && expanded <= (opts.maxNodes ?? 20000); expanded++) {
    const cur = search.next();
    if (cur === search.goal) return tracePath(search, cur, lattice);
    search.expand(cur);
  }
  return null;
}

/** A* bookkeeping for one search. */
class Search {
  readonly cost = new Map<number, number>();
  readonly came = new Map<number, number>();
  readonly goal: number;
  private open = new MinHeap();
  private near: Wall[];
  private lattice: Lattice;
  readonly stepCost: (p: Point) => number;
  private blocked: (p: Point) => boolean;

  constructor(
    readonly box: SearchBox,
    private target: Point,
    walls: readonly Wall[],
    opts: PathOptions & { lattice: Lattice },
  ) {
    this.goal = box.key(target);
    this.lattice = opts.lattice;
    this.stepCost = opts.cost ?? (() => 1);
    this.blocked = opts.blocked ?? (() => false);
    // Only walls near the search box matter.
    this.near = wallsInRect(walls, box.rect(opts.lattice));
  }

  start(square: Point): void {
    this.cost.set(this.box.key(square), 0);
    this.open.push(this.box.key(square), this.heuristic(square));
  }

  hasOpen(): boolean {
    return this.open.size > 0;
  }

  next(): number {
    return this.open.pop();
  }

  /** Queues every neighbour of `key` reachable more cheaply than before. */
  expand(key: number): void {
    const here = this.box.square(key);
    const base = this.cost.get(key)!;
    for (const [dx, dy] of this.lattice.steps) {
      const next: Point = [here[0] + dx, here[1] + dy];
      const centre = this.lattice.centre(next);
      // Square diagonals cost a hair more so straight paths win ties.
      const nextCost = base + this.stepCost(centre) * (this.lattice.kind === 'square' && dx && dy ? 1.0001 : 1);
      if (!this.box.contains(next) || nextCost >= (this.cost.get(this.box.key(next)) ?? Infinity)) continue;
      if (this.blocked(centre) || movementBlocked(this.lattice.centre(here), centre, this.near)) continue;
      const nk = this.box.key(next);
      this.cost.set(nk, nextCost);
      this.came.set(nk, key);
      this.open.push(nk, nextCost + this.heuristic(next));
    }
  }

  private heuristic(cell: Point): number {
    return this.lattice.distance(cell, this.target);
  }
}

function tracePath(search: Search, goal: number, lattice: Lattice): Path {
  const points: Point[] = [];
  for (let k: number | undefined = goal; k !== undefined; k = search.came.get(k)) {
    points.push(lattice.centre(search.box.square(k)));
  }
  points.reverse();
  const feet = points.slice(1).reduce((sum, p) => sum + 5 * search.stepCost(p), 0);
  return { points, feet };
}

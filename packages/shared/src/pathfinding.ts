import type { Rect } from './chunks.ts';
import { movementBlocked, wallsInRect } from './geometry.ts';
import type { Point, Wall } from './schema.ts';

export interface PathOptions {
  gridSize: number;
  /** Give up after expanding this many squares. */
  maxNodes?: number;
  /** How far outside the start-goal box the search may wander, in squares. */
  margin?: number;
}

export interface Path {
  /** Square centres from start to goal, start included. */
  points: Point[];
  /** Distance in feet, every square (diagonals too) costing 5 ft. */
  feet: number;
}

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

class MinHeap {
  private items: { key: number; f: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(key: number, f: number): void {
    const a = this.items;
    a.push({ key, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.f <= a[i]!.f) break;
      this.swap(p, i);
      i = p;
    }
  }

  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      this.siftDown(0);
    }
    return top.key;
  }

  private siftDown(start: number): void {
    const a = this.items;
    let i = start;
    for (;;) {
      const smallest = [2 * i + 1, 2 * i + 2]
        .filter((c) => c < a.length)
        .reduce((m, c) => (a[c]!.f < a[m]!.f ? c : m), i);
      if (smallest === i) return;
      this.swap(smallest, i);
      i = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const a = this.items;
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
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

  rect(gridSize: number): Rect {
    return { x: this.minX * gridSize, y: this.minY * gridSize, w: this.width * gridSize, h: this.height * gridSize };
  }
}

/**
 * A* over 5 ft squares on an unbounded map. Moving between two square
 * centres is allowed when the straight line between them crosses no
 * blocking wall. Returns null when the goal can't be reached.
 */
export function findPath(from: Point, to: Point, walls: readonly Wall[], opts: PathOptions): Path | null {
  const g = opts.gridSize;
  const s = squareOf(from, g);
  const t = squareOf(to, g);
  if (s[0] === t[0] && s[1] === t[1]) return { points: [squareCentre(s, g)], feet: 0 };

  const search = new Search(new SearchBox(s, t, opts.margin ?? 12), t, walls, g);
  search.start(s);
  for (let expanded = 0; search.hasOpen() && expanded <= (opts.maxNodes ?? 20000); expanded++) {
    const cur = search.next();
    if (cur === search.goal) return tracePath(search.came, cur, search.box, g);
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

  constructor(
    readonly box: SearchBox,
    private target: Point,
    walls: readonly Wall[],
    private gridSize: number,
  ) {
    this.goal = box.key(target);
    // Only walls near the search box matter.
    this.near = wallsInRect(walls, box.rect(gridSize));
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
    for (const [dx, dy] of STEPS) {
      const next: Point = [here[0] + dx, here[1] + dy];
      // Diagonals cost a hair more so straight paths win ties.
      const nextCost = base + (dx !== 0 && dy !== 0 ? 1.0001 : 1);
      if (!this.box.contains(next) || nextCost >= (this.cost.get(this.box.key(next)) ?? Infinity)) continue;
      if (movementBlocked(squareCentre(here, this.gridSize), squareCentre(next, this.gridSize), this.near)) continue;
      const nk = this.box.key(next);
      this.cost.set(nk, nextCost);
      this.came.set(nk, key);
      this.open.push(nk, nextCost + this.heuristic(next));
    }
  }

  private heuristic([x, y]: Point): number {
    return Math.max(Math.abs(x - this.target[0]), Math.abs(y - this.target[1]));
  }
}

function tracePath(came: Map<number, number>, goal: number, box: SearchBox, gridSize: number): Path {
  const points: Point[] = [];
  for (let k: number | undefined = goal; k !== undefined; k = came.get(k)) {
    points.push(squareCentre(box.square(k), gridSize));
  }
  points.reverse();
  return { points, feet: (points.length - 1) * 5 };
}

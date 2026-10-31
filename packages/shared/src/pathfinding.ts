import { movementBlocked } from './geometry.ts';
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
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
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
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0]!;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.f < a[m]!.f) m = l;
        if (r < a.length && a[r]!.f < a[m]!.f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top.key;
  }
}

/**
 * A* over 5 ft squares on an unbounded map. Moving between two square
 * centres is allowed when the straight line between them crosses no
 * blocking wall. Returns null when the goal can't be reached.
 */
export function findPath(from: Point, to: Point, walls: readonly Wall[], opts: PathOptions): Path | null {
  const g = opts.gridSize;
  const maxNodes = opts.maxNodes ?? 20000;
  const margin = opts.margin ?? 12;
  const s = squareOf(from, g);
  const t = squareOf(to, g);
  if (s[0] === t[0] && s[1] === t[1]) return { points: [squareCentre(s, g)], feet: 0 };

  const minX = Math.min(s[0], t[0]) - margin;
  const minY = Math.min(s[1], t[1]) - margin;
  const width = Math.max(s[0], t[0]) + margin - minX + 1;
  const height = Math.max(s[1], t[1]) + margin - minY + 1;
  const key = (x: number, y: number) => (y - minY) * width + (x - minX);

  // Only walls near the search box matter.
  const bx0 = minX * g, by0 = minY * g, bx1 = (minX + width) * g, by1 = (minY + height) * g;
  const near = walls.filter(
    (w) =>
      Math.max(w.a[0], w.b[0]) >= bx0 && Math.min(w.a[0], w.b[0]) <= bx1 &&
      Math.max(w.a[1], w.b[1]) >= by0 && Math.min(w.a[1], w.b[1]) <= by1,
  );

  const h = (x: number, y: number) => Math.max(Math.abs(x - t[0]), Math.abs(y - t[1]));
  const cost = new Map<number, number>();
  const came = new Map<number, number>();
  const open = new MinHeap();
  const start = key(s[0], s[1]);
  const goal = key(t[0], t[1]);
  cost.set(start, 0);
  open.push(start, h(s[0], s[1]));

  let expanded = 0;
  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goal) break;
    if (++expanded > maxNodes) return null;
    const cx = (cur % width) + minX;
    const cy = Math.floor(cur / width) + minY;
    const here = squareCentre([cx, cy], g);
    const base = cost.get(cur)!;
    for (const [dx, dy] of STEPS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < minX || ny < minY || nx >= minX + width || ny >= minY + height) continue;
      const nk = key(nx, ny);
      // Diagonals cost a hair more so straight paths win ties.
      const next = base + (dx !== 0 && dy !== 0 ? 1.0001 : 1);
      if (next >= (cost.get(nk) ?? Infinity)) continue;
      if (movementBlocked(here, squareCentre([nx, ny], g), near)) continue;
      cost.set(nk, next);
      came.set(nk, cur);
      open.push(nk, next + h(nx, ny));
    }
  }
  if (!cost.has(goal)) return null;

  const points: Point[] = [];
  for (let k: number | undefined = goal; k !== undefined; k = came.get(k)) {
    points.push(squareCentre([(k % width) + minX, Math.floor(k / width) + minY], g));
  }
  points.reverse();
  return { points, feet: (points.length - 1) * 5 };
}

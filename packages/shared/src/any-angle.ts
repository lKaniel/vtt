import { blocksMovement } from './geometry.ts';
import { MinHeap } from './min-heap.ts';
import type { Point, Wall } from './schema.ts';

// The shortest way across open ground, at any angle. The things a walker
// must go round are discs: other creatures (grown by the walker's own
// radius) and the corners at the ends of walls (a small disc, so the way
// rounds them). The shortest way among discs runs along lines that touch
// them and arcs that hug them, so the search walks from tangent to tangent
// (a "tangent graph"): from the start, round discs, to the goal. Edges are
// checked only when the search reaches them, which keeps it quick.

/** Something round to go round: its centre and radius in pixels. */
export interface Disc {
  c: Point;
  r: number;
}

/** What the search needs to know about the ground. */
export interface Ground {
  /** Whether the walker may go straight from a to b, staying clear of every disc but `hug`. */
  clear(a: Point, b: Point, hug?: number): boolean;
  /** What going straight from a to b costs (its length, more on difficult ground). */
  weigh(a: Point, b: Point): number;
  /** Whether the ground costs the same everywhere (then lengths are costs). */
  even: boolean;
  /** The longest step along an arc, in pixels. */
  step: number;
}

/** 1: counter-clockwise round a disc, -1: clockwise. */
type Turn = 1 | -1;

/** One way to arrive somewhere: by the edge from `parent`, leaving its disc at `dep`. */
interface Entry {
  key: number;
  g: number;
  /** The disc arrived on (or the goal), and which way round it. */
  disc: number;
  turn: Turn;
  at: Point;
  dep: Point;
  parent: number;
  checked: boolean;
}

const TAU = Math.PI * 2;
/** How far a point may sit inside a disc and still count as on its edge, in pixels. */
const TOUCH = 0.5;

/** How far round a disc from angle a to angle b, going `turn`, in radians. */
function sweep(a: number, b: number, turn: Turn): number {
  const d = (((turn * (b - a)) % TAU) + TAU) % TAU;
  return d > TAU - 1e-9 ? 0 : d;
}

const angleOf = (p: Point, c: Point): number => Math.atan2(p[1] - c[1], p[0] - c[0]);
const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * The line that leaves disc `a` going `ta` round it and arrives on disc `b`
 * going `tb` round it (a point is a disc of radius 0). Null when there is none
 * (the discs overlap too much).
 */
export function tangent(a: Disc, ta: Turn, b: Disc, tb: Turn): { dep: Point; arr: Point } | null {
  const [sa, sb] = [ta * a.r, tb * b.r];
  const D: Point = [b.c[0] - a.c[0], b.c[1] - a.c[1]];
  const k = sb - sa;
  const len2 = D[0] * D[0] + D[1] * D[1] - k * k;
  // A point a hair inside a disc (creatures may touch) stands on its edge.
  if (len2 < -2 * (Math.abs(k) + 1) * TOUCH) return null;
  const turnBy = Math.atan2(k, Math.sqrt(Math.max(0, len2)));
  const [cos, sin] = [Math.cos(-turnBy), Math.sin(-turnBy)];
  const n = Math.hypot(D[0], D[1]);
  if (n < 1e-9) return null;
  const d: Point = [(D[0] * cos - D[1] * sin) / n, (D[0] * sin + D[1] * cos) / n];
  // Leaving `a` going `ta` round it means standing at c - s·perp(d), perp(d) = (-dy, dx).
  return {
    dep: [a.c[0] + sa * d[1], a.c[1] - sa * d[0]],
    arr: [b.c[0] + sb * d[1], b.c[1] - sb * d[0]],
  };
}

/** Points along disc `disc` from `from` to `to`, going `turn`, `from` left out. */
function arcPoints(disc: Disc, { from, to, turn }: { from: Point; to: Point; turn: Turn }, step: number): Point[] {
  const a = angleOf(from, disc.c);
  const span = sweep(a, angleOf(to, disc.c), turn);
  const n = Math.max(1, Math.ceil((span * disc.r) / step));
  const out: Point[] = [];
  for (let i = 1; i < n; i++) {
    const t = a + (turn * span * i) / n;
    out.push([disc.c[0] + disc.r * Math.cos(t), disc.c[1] + disc.r * Math.sin(t)]);
  }
  out.push(to);
  return out;
}

/**
 * The corners a way may have to round: wall ends where the walls that meet
 * leave a gap wider than a straight line (a wall's free end, the outside of
 * an L). Ends in the middle of a straight run are never gone round.
 */
export function wallCorners(walls: readonly Wall[], r: number): Disc[] {
  const ends = new Map<string, { c: Point; dirs: number[] }>();
  for (const w of walls) {
    if (!blocksMovement(w) || dist(w.a, w.b) < 1e-6) continue;
    for (const [p, q] of [
      [w.a, w.b],
      [w.b, w.a],
    ] as const) {
      const key = `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
      const end = ends.get(key) ?? { c: p, dirs: [] };
      end.dirs.push(angleOf(q, p));
      ends.set(key, end);
    }
  }
  return [...ends.values()].filter((e) => widestGap(e.dirs) > Math.PI + 1e-6).map((e) => ({ c: e.c, r }));
}

function widestGap(dirs: number[]): number {
  const sorted = [...dirs].sort((x, y) => x - y);
  let widest = sorted[0]! + TAU - sorted.at(-1)!;
  for (let i = 1; i < sorted.length; i++) widest = Math.max(widest, sorted[i]! - sorted[i - 1]!);
  return widest;
}

/** A search from `from` to `to` round `discs`. */
export class TangentSearch {
  private entries: Entry[] = [];
  private open = new MinHeap();
  private closed = new Set<number>();
  private readonly start: number;
  private readonly goal: number;
  private readonly places: number;
  /** Set when `run` gave up before searching everywhere. */
  exhausted = false;

  constructor(
    private discs: readonly Disc[],
    private from: Point,
    private to: Point,
    private ground: Ground,
  ) {
    this.start = discs.length;
    this.goal = discs.length + 1;
    this.places = 2 * discs.length + 4;
  }

  /** The way as points, start and goal included, or null when there is none. */
  run(maxSteps = 20000): Point[] | null {
    const at = this.from;
    this.push({ key: -1, g: 0, disc: this.start, turn: 1, at, dep: at, parent: -1, checked: true });
    let steps = 0;
    while (this.open.size > 0) {
      if (++steps > maxSteps) {
        this.exhausted = true;
        return null;
      }
      const i = this.open.pop();
      const e = this.entries[i]!;
      if (this.closed.has(e.key) || !this.settle(e)) continue;
      this.closed.add(e.key);
      if (e.disc === this.goal) return this.trace(e);
      this.expand(i, e);
    }
    return null;
  }

  private discOf(i: number): Disc {
    if (i === this.start) return { c: this.from, r: 0 };
    if (i === this.goal) return { c: this.to, r: 0 };
    return this.discs[i]!;
  }

  private place(disc: number, turn: Turn): number {
    return disc * 2 + (turn > 0 ? 1 : 0);
  }

  private push(e: Entry): void {
    this.entries.push(e);
    this.open.push(this.entries.length - 1, e.g + dist(e.at, this.to));
  }

  /** Every way on from `e`: round its disc and off along a tangent to another disc, or to the goal. */
  private expand(i: number, e: Entry): void {
    for (let j = 0; j < this.discs.length; j++) {
      if (j === e.disc) continue;
      this.edge(i, j, 1);
      this.edge(i, j, -1);
    }
    this.edge(i, this.goal, 1);
  }

  /** The way from entry `i` round its disc and along the tangent that arrives on disc `j` going `turn`. */
  private edge(i: number, j: number, turn: Turn): void {
    const e = this.entries[i]!;
    const here = this.discOf(e.disc);
    const key = this.place(e.disc, e.turn) * this.places + this.place(j, turn);
    if (this.closed.has(key)) return;
    const line = tangent(here, e.turn, this.discOf(j), turn);
    if (!line) return;
    const round = here.r * sweep(angleOf(e.at, here.c), angleOf(line.dep, here.c), e.turn);
    const g = e.g + round + dist(line.dep, line.arr);
    this.push({ key, g, disc: j, turn, at: line.arr, dep: line.dep, parent: i, checked: false });
  }

  /** The points of the edge into `e`: round its parent's disc, then straight on. */
  private edgePoints(e: Entry): Point[] {
    const parent = this.entries[e.parent]!;
    if (parent.disc === this.start) return [e.at];
    const way = { from: parent.at, to: e.dep, turn: parent.turn };
    const arc = arcPoints(this.discOf(parent.disc), way, this.ground.step);
    return [...arc, e.at];
  }

  /** Checks an edge the first time it comes up; true when it may be taken now at the cost it has. */
  private settle(e: Entry): boolean {
    if (e.checked) return true;
    e.checked = true;
    const parent = this.entries[e.parent]!;
    const way = [parent.at, ...this.edgePoints(e)];
    const hug = parent.disc < this.discs.length ? parent.disc : undefined;
    for (let k = 1; k < way.length; k++) {
      // The last step leaves the disc, so it must clear it too.
      if (!this.ground.clear(way[k - 1]!, way[k]!, k < way.length - 1 ? hug : undefined)) return false;
    }
    if (this.ground.even) return true;
    let g = parent.g;
    for (let k = 1; k < way.length; k++) g += this.ground.weigh(way[k - 1]!, way[k]!);
    if (g <= e.g + 1e-6) return true;
    this.push({ ...e, g });
    return false;
  }

  private trace(goal: Entry): Point[] {
    const parts: Point[][] = [];
    for (let e = goal; e.parent >= 0; e = this.entries[e.parent]!) parts.push(this.edgePoints(e));
    parts.reverse();
    return [this.from, ...parts.flat()];
  }
}

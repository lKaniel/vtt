import { blocksMovement, distToSegment, movementBlocked } from './geometry.ts';
import type { Point, Wall } from './schema.ts';
import { gridKind, latticeOf, snapToCell } from './grid.ts';
import type { Body } from './walking.ts';

// Names, ids and squares for things put on a scene: tokens, actors, games.

/** A lowercase-dash id made from `name` that `taken` doesn't know yet. */
export function uniqueId(name: string, taken: (id: string) => boolean): string {
  const base =
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .join('-') || 'token';
  if (!taken(base)) return base;
  let n = 2;
  while (taken(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** `name`, numbered ("Goblin 2") when a creature on the map already has it. */
export function uniqueName(name: string, names: Iterable<string>): string {
  const used = new Set(names);
  if (!used.has(name)) return name;
  let n = 2;
  while (used.has(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}

/**
 * Where a token of `size` cells dropped at `p` stands: on hexes, on a hex
 * centre; otherwise odd sizes on a square centre and even ones on a corner.
 */
export function placeToken(p: Point, size: number, scene: { gridSize: number; grid?: string }): Point {
  const { gridSize } = scene;
  const kind = gridKind(scene);
  if (kind === 'hex-rows' || kind === 'hex-cols') return snapToCell(p, latticeOf(kind, gridSize));
  const offset = Math.round(size) % 2 === 1 ? 0.5 : 0;
  const snap = (v: number) => (Math.round(v / gridSize - offset) + offset) * gridSize;
  return [snap(p[0]), snap(p[1])];
}

/** The ground around a point where new creatures may appear without a grid. */
export interface Room {
  gridSize: number;
  walls: readonly Wall[];
  /** The creatures already standing there. */
  bodies: readonly Body[];
}

/** How much of its radius a body may tuck into a wall it stands beside. */
const OFF_WALL = 0.9;
/** How many rings out to look, each half a body further. */
const RINGS = 16;
/** Room for rounding, in pixels: creatures may touch, not overlap. */
const EPS = 0.5;

/**
 * Where `count` creatures of radius `r` appear around `at` without a grid:
 * the exact point first, then the nearest spots where they touch but don't
 * overlap anyone, on the aimed side of every wall and with their bodies off
 * it. When that leaves too few, the rest only keep off each other, and as a
 * last resort stand on the aimed point.
 */
export function freePlaces(at: Point, r: number, count: number, room: Room): Point[] {
  const walls = room.walls.filter(blocksMovement);
  const out: Point[] = [];
  const clear = (p: Point, bodies: readonly Body[]) => bodies.every((b) => apart(p, [b.x, b.y]) >= b.r + r - EPS);
  const free = (p: Point) =>
    clear(
      p,
      out.map(([x, y]) => ({ x, y, r })),
    );
  const reachable = (p: Point) => !movementBlocked(at, p, walls);
  const offWalls = (p: Point) => walls.every((w) => distToSegment(p, w.a, w.b) >= OFF_WALL * r);
  const spots = ringsAround(at, r);
  const pick = (ok: (p: Point) => boolean) => {
    for (const p of spots) if (out.length < count && free(p) && ok(p)) out.push(p);
  };
  pick((p) => reachable(p) && offWalls(p) && clear(p, room.bodies));
  pick(reachable);
  while (out.length < count) out.push(at);
  return out;
}

/** `at`, then rings round it half a body apart, spots on each ring half a body apart. */
function ringsAround(at: Point, r: number): Point[] {
  const out: Point[] = [at];
  for (let k = 1; k <= RINGS; k++) {
    const d = (k * r) / 2;
    const n = Math.floor((2 * Math.PI * d) / (r / 2));
    for (let i = 0; i < n; i++) {
      const t = (2 * Math.PI * i) / n;
      out.push([Math.round(at[0] + d * Math.cos(t)), Math.round(at[1] + d * Math.sin(t))]);
    }
  }
  return out;
}

function apart(p: Point, q: Point): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

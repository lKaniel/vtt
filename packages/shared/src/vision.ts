import { wallsInRect } from './geometry.ts';
import type { Light, PlacedToken, Point, Wall } from './schema.ts';
import { type Blocker, blockers, restriction, type WallSense, wallsCrossed } from './walls.ts';

// Line of sight and lighting. The server uses line-of-sight checks to decide
// which tokens each player may know about; the client uses the polygons to
// draw light, darkness and fog.

/** Whether a wall stops sight at all (limited and proximity walls may, depending on where you stand). */
export function blocksSight(wall: Wall): boolean {
  return restriction(wall, 'sight') !== 'none';
}

/** Sight, unless said otherwise. Proximity walls need the grid; without one they always block. */
const SIGHT: WallSense = { kind: 'sight', gridSize: 0 };

export function feetToPx(feet: number, gridSize: number): number {
  return (feet / 5) * gridSize;
}

/** Whether `sense` (sight by default) gets from `from` to `to` past the walls. */
export function hasLineOfSight(from: Point, to: Point, walls: readonly Wall[], sense: WallSense = SIGHT): boolean {
  return wallsCrossed(from, to, walls, sense) === 0;
}

export interface LightSource extends Light {
  x: number;
  y: number;
  /** The scene level it shines on (see levels.ts); missing = every level. */
  level?: string;
}

/** Lights carried by tokens, as placed light sources. */
export function tokenLights(tokens: Iterable<Pick<PlacedToken, 'x' | 'y' | 'light' | 'hidden'>>): LightSource[] {
  const out: LightSource[] = [];
  for (const t of tokens) if (t.light && !t.hidden) out.push({ ...t.light, x: t.x, y: t.y });
  return out;
}

interface Ray {
  origin: Point;
  dx: number;
  dy: number;
}

/** Nearest hit of the ray origin + t*dir (t > 0) on segment a-b, as t. */
function rayHit({ origin, dx, dy }: Ray, a: Point, b: Point): number | null {
  const ex = b[0] - a[0];
  const ey = b[1] - a[1];
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return null;
  const ox = a[0] - origin[0];
  const oy = a[1] - origin[1];
  const t = (ox * ey - oy * ex) / den;
  const u = (ox * dy - oy * dx) / den;
  return t > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}

/** How far the ray gets: to the first normal wall, or the second limited one. */
function reach(ray: Ray, near: readonly Blocker[], radius: number): number {
  let best = radius;
  let firstLimited = Infinity;
  for (const { wall, limited } of near) {
    const t = rayHit(ray, wall.a, wall.b);
    if (t === null) continue;
    if (!limited) best = Math.min(best, t);
    else {
      best = Math.min(best, Math.max(t, firstLimited));
      firstLimited = Math.min(firstLimited, t);
    }
  }
  return best;
}

/**
 * The area `sense` (sight by default) reaches from `origin` within `radius`
 * pixels, as a polygon (flat list x0, y0, x1, y1, ...). Rays are cast at every
 * wall end and a hair either side of it, plus a ring of rays so the edge reads
 * as a circle.
 */
export function visibilityPolygon(
  origin: Point,
  radius: number,
  walls: readonly Wall[],
  sense: WallSense = SIGHT,
): number[] {
  const [ox, oy] = origin;
  const near = blockers(
    wallsInRect(walls, { x: ox - radius, y: oy - radius, w: 2 * radius, h: 2 * radius }),
    origin,
    sense,
  );
  const angles: number[] = [];
  const RING = 64;
  for (let i = 0; i < RING; i++) angles.push((i / RING) * Math.PI * 2 - Math.PI);
  for (const { wall } of near) {
    for (const p of [wall.a, wall.b]) {
      const a = Math.atan2(p[1] - oy, p[0] - ox);
      angles.push(a - 1e-4, a, a + 1e-4);
    }
  }
  angles.sort((x, y) => x - y);
  const out: number[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const t = reach({ origin, dx, dy }, near, radius);
    out.push(ox + dx * t, oy + dy * t);
  }
  return out;
}

export function pointInPolygon(p: Point, poly: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i]!,
      yi = poly[i + 1]!,
      xj = poly[j]!,
      yj = poly[j + 1]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

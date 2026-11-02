import type { Light, Point } from './schema.ts';
import { feetToPx, type LightSource } from './vision.ts';
import type { ReachPolygon } from './walls.ts';

// The shape of the ground a light falls on: stopped by walls unless it
// shines through them, and cut down to its beam when it has an angle.

type Aimed = Pick<Light, 'angle' | 'rotation'> & { x: number; y: number };

const TAU = Math.PI * 2;
/** Turns an angle into [0, 2π). */
const norm = (a: number): number => ((a % TAU) + TAU) % TAU;

/** The beam's middle, in screen radians (0 east, clockwise); rotation 0 faces down the map. */
function facing(l: Aimed): number {
  return Math.PI / 2 + ((l.rotation ?? 0) * Math.PI) / 180;
}

/** Whether a light's beam takes in `p`; a light with no angle shines all round. */
export function inLightCone(l: Aimed, p: Point): boolean {
  if (!l.angle || l.angle >= 360) return true;
  const half = (l.angle * Math.PI) / 360;
  const off = norm(Math.atan2(p[1] - l.y, p[0] - l.x) - facing(l) + Math.PI) - Math.PI;
  return Math.abs(off) <= half + 1e-9;
}

/** A circle as a polygon (flat list), for light no wall stops. */
function circle([x, y]: Point, r: number, n = 64): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU - Math.PI;
    out.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  return out;
}

/** Where the ray from `o` at `angle` leaves a polygon drawn round `o`, between vertices i and i + 1. */
function edgeHit(o: Point, angle: number, a: Point, b: Point): Point {
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return a;
  const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den;
  return [o[0] + dx * t, o[1] + dy * t];
}

/** The point of a polygon round `o` straight out at `angle`. */
function rim(poly: readonly Point[], o: Point, angle: number): Point {
  const at = (p: Point) => Math.atan2(p[1] - o[1], p[0] - o[0]);
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i]!, poly[(i + 1) % poly.length]!];
    if (norm(angle - at(a)) <= norm(at(b) - at(a)) + 1e-12) return edgeHit(o, angle, a, b);
  }
  return poly[0]!;
}

/** The part of a polygon drawn round the light (its reach) that lies in its beam. */
function clipToCone(flat: readonly number[], l: Aimed): number[] {
  const o: Point = [l.x, l.y];
  const poly: Point[] = [];
  for (let i = 0; i < flat.length; i += 2) poly.push([flat[i]!, flat[i + 1]!]);
  const width = (l.angle! * Math.PI) / 180;
  const start = facing(l) - width / 2;
  const rel = (p: Point) => norm(Math.atan2(p[1] - o[1], p[0] - o[0]) - start);
  const inside = poly.filter((p) => rel(p) > 0 && rel(p) < width).sort((p, q) => rel(p) - rel(q));
  return [o, rim(poly, o, start), ...inside, rim(poly, o, start + width)].flat();
}

/** The ground a light falls on, as a polygon: its radius, past walls unless it ignores them, cut to its beam. */
export function lightReach(l: LightSource, gridSize: number, polygon: ReachPolygon): number[] {
  const radius = feetToPx(l.bright + l.dim, gridSize);
  const reach = l.walls === false ? circle([l.x, l.y], radius) : polygon([l.x, l.y], radius, 'light');
  return l.angle && l.angle < 360 ? clipToCone(reach, l) : reach;
}

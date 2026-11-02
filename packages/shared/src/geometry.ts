import type { Rect } from './chunks.ts';
import type { Point, Wall } from './schema.ts';

function orient(a: Point, b: Point, c: Point): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(v) < 1e-9 ? 0 : Math.sign(v);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a[0], b[0]) - 1e-9 <= p[0] &&
    p[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    Math.min(a[1], b[1]) - 1e-9 <= p[1] &&
    p[1] <= Math.max(a[1], b[1]) + 1e-9
  );
}

/** True when segments p1-p2 and q1-q2 touch or cross. */
export function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const o1 = orient(p1, p2, q1);
  const o2 = orient(p1, p2, q2);
  const o3 = orient(q1, q2, p1);
  const o4 = orient(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}

/** Distance from p to the segment a-b. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Which side of a wall `p` is on, looking from `a` to `b`; undefined on its line. */
export function sideOf(wall: Pick<Wall, 'a' | 'b'>, p: Point): 'left' | 'right' | undefined {
  const { a, b } = wall;
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (Math.abs(cross) < 1e-9) return undefined;
  return cross < 0 ? 'left' : 'right';
}

/** Whether a one-way wall lets through what comes from `from` (from the other side). */
export function passesOneWay(wall: Wall, from: Point): boolean {
  if (!wall.dir) return false;
  const side = sideOf(wall, from);
  return side !== undefined && side !== wall.dir;
}

export function blocksMovement(wall: Wall): boolean {
  return wall.door !== 'open' && wall.move !== 'none';
}

export function movementBlocked(from: Point, to: Point, walls: readonly Wall[]): boolean {
  for (const w of walls) {
    if (blocksMovement(w) && !passesOneWay(w, from) && segmentsIntersect(from, to, w.a, w.b)) return true;
  }
  return false;
}

/** Walls whose bounding box overlaps the rectangle. */
export function wallsInRect(walls: readonly Wall[], r: Rect): Wall[] {
  return walls.filter(
    (w) =>
      Math.max(w.a[0], w.b[0]) >= r.x &&
      Math.min(w.a[0], w.b[0]) <= r.x + r.w &&
      Math.max(w.a[1], w.b[1]) >= r.y &&
      Math.min(w.a[1], w.b[1]) <= r.y + r.h,
  );
}

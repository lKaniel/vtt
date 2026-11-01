import { distanceTo, type Shape } from './hit-test.ts';
import type { Point } from './schema.ts';
import type { Template } from './scene-items.ts';
import { feetToPx } from './vision.ts';

// Templates: placed areas (a fireball's sphere, a dragon's cone, a ruler
// left on the map). Their outline is worked out here once, for picking,
// drawing and for the rules asking who is caught in one.

/** A cone as wide as it is long, in degrees. */
const CONE_ANGLE = (Math.atan(0.5) * 2 * 180) / Math.PI;
const rad = (deg: number) => (deg * Math.PI) / 180;
const along = (o: Point, deg: number, len: number): Point => [
  o[0] + Math.cos(rad(deg)) * len,
  o[1] + Math.sin(rad(deg)) * len,
];
const round = (p: Point): Point => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];

function cone(o: Point, dir: number, len: number, angle: number): Point[] {
  // The far edge as an arc, in steps of at most 15 degrees.
  const steps = Math.max(2, Math.ceil(angle / 15));
  const arc = Array.from({ length: steps + 1 }, (_, i) => along(o, dir - angle / 2 + (angle * i) / steps, len));
  return [o, ...arc].map(round);
}

function line(o: Point, dir: number, len: number, width: number): Point[] {
  const end = along(o, dir, len);
  const [nx, ny] = [-Math.sin(rad(dir)) * (width / 2), Math.cos(rad(dir)) * (width / 2)];
  const pts: Point[] = [
    [o[0] + nx, o[1] + ny],
    [end[0] + nx, end[1] + ny],
    [end[0] - nx, end[1] - ny],
    [o[0] - nx, o[1] - ny],
  ];
  return pts.map(round);
}

function square(o: Point, dir: number, side: number): Point[] {
  const h = side / 2;
  const corners: Point[] = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  const [c, s] = [Math.cos(rad(dir)), Math.sin(rad(dir))];
  return corners.map(([x, y]) => round([o[0] + x * c - y * s, o[1] + x * s + y * c]));
}

/** The template's outline in map pixels: a circle, or a polygon. */
export function templateShape(t: Template, gridSize: number): Shape {
  const o: Point = [t.x, t.y];
  const len = feetToPx(t.distance, gridSize);
  const dir = t.direction ?? 0;
  switch (t.shape) {
    case 'circle':
      return { kind: 'circle', c: o, r: len };
    case 'cone':
      return { kind: 'polygon', points: cone(o, dir, len, t.angle ?? CONE_ANGLE) };
    case 'line':
      return { kind: 'polygon', points: line(o, dir, len, feetToPx(t.width ?? 5, gridSize)) };
    case 'square':
      return { kind: 'polygon', points: square(o, dir, len) };
  }
}

/** Whether `p` is inside the template, or within `slack` pixels of its edge. */
export function inTemplate(t: Template, p: Point, gridSize: number, slack = 0): boolean {
  return distanceTo(templateShape(t, gridSize), p) <= slack;
}

/** Where its aim handle sits: along its direction, as far as it reaches (a square's: its edge). */
export function templateEnd(t: Template, gridSize: number): Point {
  const len = feetToPx(t.shape === 'square' ? t.distance / 2 : t.distance, gridSize);
  return round(along([t.x, t.y], t.direction ?? 0, len));
}

/** Aiming from the origin at `to`: how far (5 ft steps) and which way (15 degree steps); Shift: 1 ft, 1 degree. */
export function aimTemplate(
  t: Template,
  to: Point,
  { gridSize, free }: { gridSize: number; free: boolean },
): { distance: number; direction: number } {
  const [dx, dy] = [to[0] - t.x, to[1] - t.y];
  const reach = (Math.hypot(dx, dy) / gridSize) * 5 * (t.shape === 'square' ? 2 : 1);
  const step = free ? 1 : 5;
  const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  const turn = free ? 1 : 15;
  return {
    distance: Math.max(step, Math.round(reach / step) * step),
    direction: (Math.round(deg / turn) * turn) % 360,
  };
}

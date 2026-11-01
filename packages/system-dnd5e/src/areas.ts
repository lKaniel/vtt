import { feetToPx, type Point, pointInPolygon } from '@vtt/shared';
import type { Area } from './spell-schema.ts';

// Where a spell's area lands. Spheres and ranged cubes sit on the aimed
// point; cones, lines and self cubes start at the caster and point at it;
// emanations surround the caster. The client draws the same shapes.

interface Placed {
  x: number;
  y: number;
  /** Squares per side. */
  size: number;
}

export interface Aim {
  caster: Placed;
  aim: Point;
  gridSize: number;
}

export type AreaShape = { kind: 'circle'; center: Point; radius: number } | { kind: 'polygon'; points: Point[] };

interface AreaSpell {
  area: Area;
  /** The spell's range: 0 means the area starts at the caster. */
  range: number;
}

function direction(from: Point, to: Point): Point {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  return len ? [dx / len, dy / len] : [1, 0];
}

/** A strip from `start` along `dir`, `length` px long and `width` px wide. */
function strip(start: Point, dir: Point, length: number, width: number): Point[] {
  const [dx, dy] = dir;
  const px = (-dy * width) / 2;
  const py = (dx * width) / 2;
  const end: Point = [start[0] + dx * length, start[1] + dy * length];
  return [
    [start[0] + px, start[1] + py],
    [end[0] + px, end[1] + py],
    [end[0] - px, end[1] - py],
    [start[0] - px, start[1] - py],
  ];
}

function cone(origin: Point, dir: Point, length: number): Point[] {
  const [dx, dy] = dir;
  const end: Point = [origin[0] + dx * length, origin[1] + dy * length];
  const half = length / 2;
  return [origin, [end[0] + dy * half, end[1] - dx * half], [end[0] - dy * half, end[1] + dx * half]];
}

function square(center: Point, side: number): Point[] {
  const h = side / 2;
  const [x, y] = center;
  return [
    [x - h, y - h],
    [x + h, y - h],
    [x + h, y + h],
    [x - h, y + h],
  ];
}

/** The area's outline in pixels. */
export function areaShape({ area, range }: AreaSpell, { caster, aim, gridSize }: Aim): AreaShape {
  const origin: Point = [caster.x, caster.y];
  const size = feetToPx(area.size, gridSize);
  const dir = direction(origin, aim);
  switch (area.shape) {
    case 'sphere':
      return { kind: 'circle', center: aim, radius: size };
    case 'emanation':
      return { kind: 'circle', center: origin, radius: size + (caster.size * gridSize) / 2 };
    case 'cone':
      return { kind: 'polygon', points: cone(origin, dir, size) };
    case 'line':
      return { kind: 'polygon', points: strip(origin, dir, size, feetToPx(area.width, gridSize)) };
    case 'cube':
      return {
        kind: 'polygon',
        points: range > 0 ? square(aim, size) : selfCube(origin, dir, size, (caster.size * gridSize) / 2),
      };
  }
}

/** A cube whose near face touches the caster's edge, `edge` px from its centre. */
function selfCube(origin: Point, dir: Point, size: number, edge: number): Point[] {
  return strip([origin[0] + dir[0] * edge, origin[1] + dir[1] * edge], dir, size, size);
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const [vx, vy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

function nearPolygon(p: Point, points: readonly Point[], slack: number): boolean {
  if (pointInPolygon(p, points.flat())) return true;
  return points.some((a, i) => distToSegment(p, a, points[(i + 1) % points.length]!) <= slack);
}

/** Whether a token is caught: its centre inside the area, give or take a quarter square per size. */
export function inArea(spell: AreaSpell, { caster, aim, gridSize, token }: Aim & { token: Placed }): boolean {
  const fromCaster = spell.area.shape !== 'sphere' && !(spell.area.shape === 'cube' && spell.range > 0);
  if (fromCaster && token.x === caster.x && token.y === caster.y) return false;
  const shape = areaShape(spell, { caster, aim, gridSize });
  const p: Point = [token.x, token.y];
  const slack = (token.size * gridSize) / 4;
  if (shape.kind === 'circle')
    return Math.hypot(p[0] - shape.center[0], p[1] - shape.center[1]) <= shape.radius + slack;
  return nearPolygon(p, shape.points, slack);
}

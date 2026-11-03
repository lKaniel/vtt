import type { Point } from '@vtt/shared';

// Where a picture tile stands: turned clockwise about its centre and
// mirrored, as Foundry draws them. Pure, so it can be tested without a GPU.

export interface Posed {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
}

export interface Pose {
  position: Point;
  pivot: Point;
  angle: number;
  scale: Point;
}

const turned = (t: Posed) => !!(t.rotation ?? t.flipX ?? t.flipY);

/** The Pixi position, pivot, angle (degrees) and scale that draw the tile. */
export function tilePose(t: Posed): Pose {
  const scale: Point = [t.flipX ? -1 : 1, t.flipY ? -1 : 1];
  if (!turned(t)) return { position: [t.x, t.y], pivot: [0, 0], angle: 0, scale };
  const [cx, cy] = [t.w / 2, t.h / 2];
  return { position: [t.x + cx, t.y + cy], pivot: [cx, cy], angle: t.rotation ?? 0, scale };
}

/** A point on the map in the tile's own unturned frame (its rectangle's coordinates). */
export function intoTile(t: Posed, [x, y]: Point): Point {
  if (!t.rotation) return [x, y];
  const [cx, cy] = [t.x + t.w / 2, t.y + t.h / 2];
  const a = (-t.rotation * Math.PI) / 180;
  const [dx, dy] = [x - cx, y - cy];
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

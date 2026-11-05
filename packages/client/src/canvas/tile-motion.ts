import type { Point } from '@vtt/shared';
import { intoTile } from './tile-pose.ts';

// How tiles move: videos and animated pictures, roofs that fade while your
// creatures stand under them, and pictures that scroll. Pure, so it can be
// tested without a GPU; ChunkLayer draws it.

export type TileMedia = 'video' | 'gif' | 'image';

const VIDEO = new Set(['webm', 'mp4', 'm4v', 'ogv', 'mov']);

/** What a tile's picture is, by its file's extension. */
export function tileMedia(src: string): TileMedia {
  const ext = /\.([a-z0-9]+)$/i.exec(src.split('?')[0]!)?.[1]?.toLowerCase() ?? '';
  if (VIDEO.has(ext)) return 'video';
  return ext === 'gif' ? 'gif' : 'image';
}

interface Roof {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  occludedAlpha?: number;
}

/** Whether map point `at` lies on the roof (inside its turned rectangle). */
function onRoof(roof: Roof, at: Point): boolean {
  const [x, y] = intoTile(roof, at);
  return x >= roof.x && x <= roof.x + roof.w && y >= roof.y && y <= roof.y + roof.h;
}

/** The corners of a tile on the map, turned about its centre. */
function cornersOf(t: Roof): Point[] {
  const [cx, cy] = [t.x + t.w / 2, t.y + t.h / 2];
  const a = ((t.rotation ?? 0) * Math.PI) / 180;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const [dx, dy] = [(sx! * t.w) / 2, (sy! * t.h) / 2];
    return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)] as Point;
  });
}

/** Who roofs fade for: where they stand, and the roofs over them. */
export interface RoofSight {
  watchers: readonly Point[];
  covers: readonly Roof[];
}

/** The roofs a watcher stands under. */
export function roofsOver<R extends Roof>(roofs: readonly R[], watchers: readonly Point[]): R[] {
  return roofs.filter((r) => watchers.some((at) => onRoof(r, at)));
}

/**
 * How opaque a roof should be: see-through (its `occludedAlpha`, default 0)
 * while a watcher stands under it, or under a roof (`covers`) it lies wholly
 * on, so a building's upper floor, its roof and what sits on them go together.
 */
export function roofAlpha(roof: Roof, watchers: readonly Point[], covers: readonly Roof[] = []): number {
  const under =
    watchers.some((at) => onRoof(roof, at)) ||
    covers.some((c) => c !== roof && cornersOf(roof).every((p) => onRoof(c, p)));
  return under ? (roof.occludedAlpha ?? 0) : 1;
}

/** Roofs fade over a quarter of a second. */
const FADE_PER_SECOND = 4;

export function easeAlpha(current: number, target: number, dt: number): number {
  const step = FADE_PER_SECOND * dt;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}

export interface RoofEyes {
  gm: boolean;
  /** The creatures you see through. */
  yours: readonly string[];
  /** The tokens selected on the map. */
  selected: readonly string[];
}

/** Where the creatures a roof fades for stand: yours, or for the GM the selected ones. */
export function roofWatchers(eyes: RoofEyes, placeOf: (id: string) => { at: Point } | undefined): Point[] {
  const ids = eyes.gm ? eyes.selected : eyes.yours;
  return ids.flatMap((id) => {
    const at = placeOf(id)?.at;
    return at ? [at] : [];
  });
}

/** How far a scrolling picture has slid after `seconds`, wrapped to one repeat. */
export function scrollOffset(scroll: { x: number; y: number }, seconds: number, w: number, h: number): Point {
  const wrap = (v: number, size: number) => ((v % size) + size) % size;
  return [wrap(scroll.x * seconds, w), wrap(scroll.y * seconds, h)];
}

import type { Point } from '@vtt/shared';

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
  occludedAlpha?: number;
}

/** How opaque a roof should be: see-through (its `occludedAlpha`, default 0) while a watcher stands under it. */
export function roofAlpha(roof: Roof, watchers: readonly Point[]): number {
  const under = watchers.some(([x, y]) => x >= roof.x && x <= roof.x + roof.w && y >= roof.y && y <= roof.y + roof.h);
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

import { type Chunk, type Rect, tileClickable } from '@vtt/shared';
import { tileMedia } from './tile-motion.ts';
import { type Posed, tilePose } from './tile-pose.ts';

// Busy maps stack tiles three to five deep, and drawing every one of them
// every frame is what makes them slow. Still tiles are drawn once into map
// pieces (cells) at about the screen's resolution and shown as pictures;
// tiles that move (videos, GIFs, scrolling pictures), roofs that fade and
// tiles you can click stay live, and cut the draw order into runs so they
// still sit between the tiles below and above them. Pure, so it can be
// tested without a GPU; TileBaker draws it.

/** A cell's side in map pixels. */
export const BAKE_CELL = 1024;
const MIN_SCALE = 1 / 16;
const MAX_SCALE = 2;

/** The texels per map pixel to bake at: the power of two at or above what the screen shows, between 1/16 and 2. */
export function bakeScale(screenPerMap: number): number {
  const scale = 2 ** Math.ceil(Math.log2(Math.max(screenPerMap, 1e-6)));
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Every cell `[cx, cy]` the rectangle touches, row by row. */
export function cellsOver(r: Rect, cell = BAKE_CELL): [number, number][] {
  const out: [number, number][] = [];
  const [x0, x1] = [Math.floor(r.x / cell), Math.ceil((r.x + r.w) / cell)];
  const [y0, y1] = [Math.floor(r.y / cell), Math.ceil((r.y + r.h) / cell)];
  for (let cy = y0; cy < y1; cy++) for (let cx = x0; cx < x1; cx++) out.push([cx, cy]);
  return out;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Where a tile is drawn, turned as it stands, padded by `pad` on every side (drop shadows, rough edges). */
export function tileBounds(tile: Posed, pad: number): Rect {
  const { position, pivot, angle } = tilePose(tile);
  const a = (angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(a), Math.sin(a)];
  const corners = [
    [0, 0],
    [tile.w, 0],
    [0, tile.h],
    [tile.w, tile.h],
  ].map(([x, y]) => {
    const [dx, dy] = [x! - pivot[0], y! - pivot[1]];
    return [position[0] + dx * cos - dy * sin, position[1] + dx * sin + dy * cos] as const;
  });
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const [x, y] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

/** How far past its rectangle a tile may draw (rough edges, see art/ground.ts). */
const EDGE_PAD = 24;

/** How far past its rectangle a tile draws: rough edges, and its drop shadow. */
export function tilePad(tile: Chunk['tiles'][number]): number {
  const shadow = tile.kind === 'image' ? tile.shadow : undefined;
  return EDGE_PAD + (shadow ? shadow.offset + shadow.blur * 3 : 0);
}

/** Whether a tile looks the same every frame, so it can be baked: not a roof, video, GIF, scrolling picture or click target. */
export function tileStill(tile: Chunk['tiles'][number], gm: boolean): boolean {
  if (tileClickable(tile, gm) || tile.description) return false;
  if (tile.kind !== 'image') return true;
  return !tile.overhead && !tile.scroll && tileMedia(tile.src) === 'image';
}

/** Whether a roof can be baked: it would be still on the ground, and it is fully drawn (not fading over a creature). */
export function roofStill(tile: Chunk['tiles'][number], gm: boolean, alpha: number): boolean {
  return alpha >= 1 && tileStill(tile.kind === 'image' ? { ...tile, overhead: false } : tile, gm);
}

export interface Stacked {
  id: string;
  z: number;
  still: boolean;
  bounds: Rect;
}

/** Still tiles between two live ones, drawn together; `key` names the live tile below (or '' for the bottom). */
export interface BakeRun<T> {
  key: string;
  z: number;
  items: T[];
}

export type Stack<T> = { run: BakeRun<T> } | { tile: T };

/**
 * The tiles in draw order (stable for equal `z`): runs of still tiles and
 * the live tiles between them. A live tile rises over the still tiles above
 * it that don't cover it (the picture is the same), so a torch on a wall
 * cuts the run only when something is drawn over it.
 */
export function bakeRuns<T extends Stacked>(tiles: readonly T[]): Stack<T>[] {
  const sorted = tiles.map((t, i) => ({ t, i })).sort((a, b) => a.t.z - b.t.z || a.i - b.i);
  const stack: Stack<T>[] = [];
  let run: BakeRun<T> | undefined;
  let waiting: T[] = [];
  let key = '';
  const flush = () => {
    for (const t of waiting) stack.push({ tile: t });
    key = waiting.at(-1)?.id ?? key;
    waiting = [];
    run = undefined;
  };
  for (const { t } of sorted) {
    if (!t.still) waiting.push(t);
    else {
      if (waiting.some((w) => overlaps(w.bounds, t.bounds))) flush();
      if (run) run.items.push(t);
      else {
        run = { key, z: t.z, items: [t] };
        stack.push({ run });
      }
    }
  }
  flush();
  return stack;
}

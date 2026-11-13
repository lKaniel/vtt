import { z } from 'zod';
import type { Rect } from './chunks.ts';

// An optimised scene (scene.json `optimised`, `bake`): its still tiles are
// drawn once, floor by floor, into one picture, cut into a pyramid of square
// blocks like a web map. Zoom 0 is the sharpest (`scale` texels per map
// pixel); each zoom after it is half as sharp, until the last holds the
// whole floor in one block. The map shows the blocks of the zoom the screen
// needs instead of the tiles, so a big map costs a weak computer a few
// pictures instead of thousands. The files live in the game's
// assets/baked/<scene>/<bake>/: manifest.json, and <group>/<zoom>/<x>_<y>.<ext>.

/** A block's side in texels. */
export const BAKE_BLOCK = 512;
/** Most blocks at zoom 0 per floor before the bake drops to half the sharpness. */
const MAX_TOP_BLOCKS = 1600;
/** The sharpest a bake gets: one texel per map pixel. */
const MAX_SCALE = 1;
const MIN_SCALE = 1 / 64;

/** One floor's picture (or the tiles on every floor's: no `level`). */
export const BakeGroupSchema = z.object({
  level: z.string().optional(),
  /** The part of the map it covers; block [0, 0] starts at its corner. */
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  zooms: z.number().int().min(1).max(30),
  /** The tiles drawn into it, each with a fingerprint of how it looked. */
  tiles: z.record(z.string(), z.string()),
  /** Per zoom, the blocks with anything in them: "x_y". */
  blocks: z.array(z.array(z.string())),
});
export type BakeGroup = z.infer<typeof BakeGroupSchema>;

export const BakeManifestSchema = z.object({
  v: z.literal(1),
  block: z.number().int().positive(),
  scale: z.number().positive(),
  ext: z.enum(['webp', 'png']),
  groups: z.array(BakeGroupSchema),
});
export type BakeManifest = z.infer<typeof BakeManifestSchema>;

/** A bake's folder under the game's assets. */
export const bakeFolder = (scene: string, bake: string): string => `baked/${scene}/${bake}`;

/** A block's file in its bake's folder. */
export const bakePath = (group: number, zoom: number, [x, y]: readonly [number, number], ext: string): string =>
  `${group}/${zoom}/${x}_${y}.${ext}`;

/** Whether `path` is a file a bake may hold: a block picture or the manifest. */
export function bakeFileOk(path: string): boolean {
  return path === 'manifest.json' || /^\d{1,3}\/\d{1,2}\/\d{1,5}_\d{1,5}\.(webp|png)$/.test(path);
}

/** The sharpness of zoom 0: one texel per map pixel, halved until the floor fits in `MAX_TOP_BLOCKS` blocks. */
export function bakeTopScale(area: Rect, block = BAKE_BLOCK): number {
  let scale = MAX_SCALE;
  const count = (s: number) => Math.ceil((area.w * s) / block) * Math.ceil((area.h * s) / block);
  while (scale > MIN_SCALE && count(scale) > MAX_TOP_BLOCKS) scale /= 2;
  return scale;
}

/** Map pixels one block covers at `zoom`. */
export const bakeSpan = (scale: number, zoom: number, block = BAKE_BLOCK): number => (block * 2 ** zoom) / scale;

/** How many zooms the pyramid has: the last holds the whole floor in one block. */
export function bakeZooms(area: Rect, scale: number, block = BAKE_BLOCK): number {
  let zoom = 0;
  while (bakeSpan(scale, zoom, block) < Math.max(area.w, area.h)) zoom++;
  return zoom + 1;
}

/** The coarsest zoom with at least `screenPerMap` texels per map pixel (zoom 0 when none has). */
export function bakeZoomFor(screenPerMap: number, scale: number, zooms: number): number {
  const zoom = Math.floor(Math.log2(scale / Math.max(screenPerMap, 1e-9)));
  return Math.min(zooms - 1, Math.max(0, zoom));
}

/** The blocks `[x, y]` of `zoom` that the rectangle `view` touches, inside the floor's `area`. */
export function bakeBlocksOver(area: Rect, scale: number, zoom: number, view: Rect): [number, number][] {
  const span = bakeSpan(scale, zoom);
  const [cols, rows] = [Math.ceil(area.w / span), Math.ceil(area.h / span)];
  const x0 = Math.max(0, Math.floor((view.x - area.x) / span));
  const y0 = Math.max(0, Math.floor((view.y - area.y) / span));
  const x1 = Math.min(cols, Math.ceil((view.x + view.w - area.x) / span));
  const y1 = Math.min(rows, Math.ceil((view.y + view.h - area.y) / span));
  const out: [number, number][] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out.push([x, y]);
  return out;
}

import { z } from 'zod';

// Ground raised from a heightmap picture on a tile, like 3D Canvas's terrain
// tiles: hills, terraces, a cave floor. The picture's red says how high each
// spot stands; the tallest spot stands `height` feet over the bottom. The 3D
// view builds it (client view3d/terrain3d.ts); here is how high it stands,
// so it can be tested.

const fraction = z.number().min(0).max(1);

/** A picture painted over the ground where it stands high enough (or, by slope, flat enough). */
export const TerrainLayerSchema = z.object({
  src: z.string().optional(),
  color: z.string().optional(),
  /** Times the picture repeats across the tile. */
  repeat: z.number().positive().optional(),
  /** From what share of the height (or flatness) up it shows. */
  from: fraction,
});

export const Terrain3DSchema = z.object({
  /** The heightmap picture; only its red is read. */
  heightmap: z.string(),
  /** The part of the picture read: `[a, b, c, d]` reads u' = a + u/c, v' = b + v/d, wrapping round. */
  window: z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]).optional(),
  /** White is high (else black is). */
  highIsWhite: z.boolean().optional(),
  /** Feet from the bottom to the highest peak. */
  height: z.number().positive(),
  /** Feet above the ground its bottom stands at; none = the floor it is on. */
  elevation: z.number().optional(),
  /** Degrees it turns clockwise round the tile's middle, seen from above. */
  rotation: z.number().optional(),
  /** Segments a grid square each way (default 1). */
  detail: z.number().positive().optional(),
  /** Up to four pictures painted over it, later ones on top. */
  layers: z.array(TerrainLayerSchema).max(4).optional(),
  /** How wide (as a share) one layer fades into the next. */
  blend: z.number().min(0).max(0.25).optional(),
  /** Layers go by flatness (1 flat, 0 a cliff) instead of height. */
  bySlope: z.boolean().optional(),
  /** Its colour where no layer covers it. */
  color: z.string().optional(),
});
export type Terrain3D = z.infer<typeof Terrain3DSchema>;

/** A heightmap picture's red, pixel by pixel (0–255). */
export interface Heightmap {
  width: number;
  height: number;
  red(x: number, y: number): number;
}

const wrap = (n: number, size: number) => ((n % size) + size) % size;

/** How high (0–1) the picture says the spot `[u, v]` across the tile (0–1 each) stands. */
export function heightmapAt(map: Heightmap, [u, v]: readonly [number, number], terrain: Terrain3D): number {
  const [a, b, c, d] = terrain.window ?? [0, 0, 1, 1];
  const x = wrap(Math.floor((a + u / c) * map.width), map.width);
  const y = wrap(Math.floor((b + v / d) * map.height), map.height);
  const red = map.red(x, y) / 255;
  return terrain.highIsWhite ? red : 1 - red;
}

const MAX_CELLS = 256;

/** How many segments it has across and down: `detail` a grid square, 1 to 256 each way. */
export function terrainCells(rect: { w: number; h: number }, terrain: Terrain3D, grid: number): [number, number] {
  const n = (side: number) => Math.min(MAX_CELLS, Math.max(1, Math.ceil((side / grid) * (terrain.detail ?? 1))));
  return [n(rect.w), n(rect.h)];
}

/**
 * Feet over the bottom at each spot `[u, v]` (0–1 across the tile), stretched
 * so the highest of them stands `height` up, as 3D Canvas does (flat stays flat).
 */
export function terrainLift(
  map: Heightmap,
  spots: readonly (readonly [number, number])[],
  terrain: Terrain3D,
): number[] {
  const raw = spots.map((uv) => heightmapAt(map, uv, terrain));
  const top = Math.max(0, ...raw);
  return raw.map((h) => (top > 0 ? (h / top) * terrain.height : 0));
}

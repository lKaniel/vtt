import { z } from 'zod';
import type { ModelGround } from './model3d.ts';

// A drawn 3D shape on a tile, like 3D Canvas's polygons (a cliff, a pool, a
// ledge): an outline across the tile, raised as a solid `height` feet tall
// from its elevation. The 3D view draws it (client view3d/solids3d.ts); here
// is where it stands, so it can be tested.

const fraction = z.number().min(0).max(1);

export const Solid3DSchema = z.object({
  /** Its corners in order, as fractions of the tile's width and height (0,0 its top-left). */
  points: z.array(z.tuple([fraction, fraction])).min(3),
  /** How tall it stands, feet. */
  height: z.number().positive(),
  /** Feet above the ground its base stands at; none = the floor it is on. */
  elevation: z.number().optional(),
  /** Degrees it turns clockwise round the tile's middle, seen from above. */
  rotation: z.number().optional(),
  color: z.string().optional(),
});
export type Solid3D = z.infer<typeof Solid3DSchema>;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Its corners on the map, in pixels. */
export function solidOutline(rect: Rect, solid: Solid3D): [number, number][] {
  const turn = ((solid.rotation ?? 0) * Math.PI) / 180;
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const [mx, my] = [rect.x + rect.w / 2, rect.y + rect.h / 2];
  return solid.points.map(([fx, fy]) => {
    const [dx, dy] = [rect.x + fx * rect.w - mx, rect.y + fy * rect.h - my];
    return [mx + dx * c - dy * s, my + dx * s + dy * c];
  });
}

/** Pixels above the floor shown its base stands at, and how tall it is. */
export function solidSpan(solid: Solid3D, ground: ModelGround): { base: number; height: number } {
  const px = ground.grid / ground.feet;
  return { base: ((solid.elevation ?? ground.floor) - ground.floor) * px, height: solid.height * px };
}

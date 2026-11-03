import { z } from 'zod';

// 3D models (glTF) for the 3D view (client view3d/): on an image tile, a
// model stretched over the tile or repeated across it, like Foundry's 3D
// Canvas; on a token, the figure that stands for it. The 2D map ignores them.

export const Model3DSchema = z.object({
  /** A glTF model: a .glb, or a .gltf with its files beside it. */
  src: z.string().min(1),
  /** Feet above the ground its base stands at (like a token's elevation); none = the floor it is on. */
  elevation: z.number().optional(),
  /** How tall it stands, feet; none = in proportion to its width. */
  height: z.number().positive().optional(),
  /** Degrees it turns clockwise, seen from above. */
  rotation: z.number().optional(),
  /** Degrees it leans round the map's x axis and round its y axis. */
  tilt: z.tuple([z.number(), z.number()]).optional(),
  /**
   * `stretch` (the default): one model fills the tile; `fit`: one model in
   * its own proportions, `height` feet tall or as wide as the tile allows (a
   * creature's figure); `tile`: the model repeats, one every `piece` squares.
   */
  fill: z.enum(['stretch', 'fit', 'tile']).optional(),
  piece: z.number().positive().optional(),
  /** A colour multiplied into it. */
  color: z.string().optional(),
});
export type Model3D = z.infer<typeof Model3DSchema>;

/** Where a model sits on the map, in pixels; its feet run to pixels by `grid` per `feet`. */
export interface ModelGround {
  grid: number;
  feet: number;
  /** Feet the floor shown starts at. */
  floor: number;
}

/** One copy of a model: its middle on the map, its base above the floor, and how much it is scaled, turned and tilted. */
export interface ModelPiece {
  at: [number, number];
  /** Pixels above the floor shown. */
  base: number;
  /** Model units to pixels along its width (map x), height and depth (map y). */
  scale: readonly [number, number, number];
  /** Radians round the vertical, three.js's way (counter-clockwise seen from above). */
  yaw: number;
  tilt: readonly [number, number];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEG = Math.PI / 180;

/** The copies of a model a tile shows: `bounds.size` is the model's own width, height and depth. */
export function modelPieces(
  rect: Rect,
  model: Model3D,
  ground: ModelGround,
  bounds: { size: readonly [number, number, number] },
): ModelPiece[] {
  const px = ground.grid / ground.feet;
  const [nx, ny] = model.fill === 'tile' ? cellsOf(rect, (model.piece ?? 1) * ground.grid) : [1, 1];
  const [cw, ch] = [rect.w / nx, rect.h / ny];
  const [sx, sy, sz] = bounds.size.map((n) => n || 1) as [number, number, number];
  const scale = scaleOf(model, [cw / sx, ch / sz], model.height === undefined ? undefined : (model.height * px) / sy);
  const turn = (model.rotation ?? 0) * DEG;
  const middle: [number, number] = [rect.x + rect.w / 2, rect.y + rect.h / 2];
  const piece = {
    base: ((model.elevation ?? ground.floor) - ground.floor) * px,
    scale,
    yaw: -turn,
    tilt: [(model.tilt?.[0] ?? 0) * DEG, (model.tilt?.[1] ?? 0) * DEG] as const,
  };
  const out: ModelPiece[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const off: [number, number] = [(i + 0.5) * cw - rect.w / 2, (j + 0.5) * ch - rect.h / 2];
      out.push({ ...piece, at: turned(middle, off, turn) });
    }
  return out;
}

/** Model units to pixels: `across` fits the cell, `up` the height asked for. */
function scaleOf(model: Model3D, across: [number, number], up: number | undefined): readonly [number, number, number] {
  if (model.fill === 'fit') {
    const k = up ?? Math.min(...across);
    return [k, k, k];
  }
  return [across[0], up ?? (across[0] + across[1]) / 2, across[1]];
}

/** How many pieces of `side` pixels fit across and down, at least one each way. */
function cellsOf(rect: Rect, side: number): [number, number] {
  return [Math.max(1, Math.round(rect.w / side)), Math.max(1, Math.round(rect.h / side))];
}

/** `middle` plus `off` turned clockwise by `turn` radians on the map (y runs south). */
function turned(middle: [number, number], [dx, dy]: [number, number], turn: number): [number, number] {
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  return [middle[0] + dx * c - dy * s, middle[1] + dx * s + dy * c];
}

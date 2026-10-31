import { z } from 'zod';

// Every file in a world folder is described here. The checker, the server and
// the docs in docs/world-format.md all follow these schemas.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');

export const PointSchema = z.tuple([z.number(), z.number()]);
export type Point = z.infer<typeof PointSchema>;

export const PlayerSchema = z.object({
  id,
  name: z.string().min(1),
  role: z.enum(['gm', 'player']),
  color: z.string().default('#8a8a8a'),
});
export type Player = z.infer<typeof PlayerSchema>;

export const WorldSchema = z.object({
  name: z.string().min(1),
  /** Pixels per 5 ft square. */
  gridSize: z.number().int().positive().default(100),
  /** Side of a storage/streaming chunk, in pixels. Must be a multiple of gridSize. */
  chunkSize: z.number().int().positive().default(2000),
  /** Where the camera starts, in pixels. */
  start: PointSchema.default([0, 0]),
  players: z.array(PlayerSchema).min(1),
});
export type World = z.infer<typeof WorldSchema>;

const tileBase = { id, x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() };

export const TileSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rect'), ...tileBase, color: z.string() }),
  z.object({ kind: z.literal('image'), ...tileBase, src: z.string().min(1) }),
]);
export type Tile = z.infer<typeof TileSchema>;

export const DoorStateSchema = z.enum(['closed', 'open', 'locked']);
export type DoorState = z.infer<typeof DoorStateSchema>;

export const WallSchema = z.object({
  id,
  a: PointSchema,
  b: PointSchema,
  /** Present only on doors. */
  door: DoorStateSchema.optional(),
});
export type Wall = z.infer<typeof WallSchema>;

export const ChunkSchema = z.object({
  tiles: z.array(TileSchema).default([]),
  walls: z.array(WallSchema).default([]),
});
export type Chunk = z.infer<typeof ChunkSchema>;

export const TokenSchema = z.object({
  id,
  name: z.string().min(1),
  /** Centre of the token, in pixels. */
  x: z.number(),
  y: z.number(),
  /** Size in squares (1 = medium, 2 = large). */
  size: z.number().positive().default(1),
  color: z.string().default('#b04a3a'),
  img: z.string().optional(),
  /** Walking speed in feet. */
  speed: z.number().nonnegative().default(30),
  /** Player ids that may control this token. The GM always can. */
  controllers: z.array(id).default([]),
  /** Hidden tokens are seen by the GM only. */
  hidden: z.boolean().default(false),
  /** When set, only these players (and the GM) see the token. Used by illusions. */
  visibleTo: z.array(id).optional(),
});
export type Token = z.infer<typeof TokenSchema>;

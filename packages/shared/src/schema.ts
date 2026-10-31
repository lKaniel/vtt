import { z } from 'zod';
import { EffectSchema } from './spell-schema.ts';
import { EditionSchema, InventoryEntrySchema, StatsSchema } from './stats-schema.ts';

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
  /** How dark unlit areas are: 0 is full daylight, 1 is pitch black. */
  darkness: z.number().min(0).max(1).default(0),
  /** Rules edition: "2014" (SRD 5.1) or "2024" (SRD 5.2). Characters can override it. */
  rules: EditionSchema.default('2014'),
  /** When true, players only see what their tokens can see. */
  vision: z.boolean().default(true),
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
  /** false for windows and bars: they block movement but not sight. */
  sight: z.boolean().optional(),
});
export type Wall = z.infer<typeof WallSchema>;

/** Light radii are in feet, like the rules. */
export const LightSchema = z.object({
  bright: z.number().nonnegative(),
  dim: z.number().nonnegative().default(0),
});
export type Light = z.infer<typeof LightSchema>;

export const PlacedLightSchema = LightSchema.extend({ id, x: z.number(), y: z.number() });
export type PlacedLight = z.infer<typeof PlacedLightSchema>;

export const ChunkSchema = z.object({
  tiles: z.array(TileSchema).default([]),
  walls: z.array(WallSchema).default([]),
  lights: z.array(PlacedLightSchema).default([]),
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
  /** Darkvision range in feet; 0 for none. */
  darkvision: z.number().nonnegative().default(0),
  /** A light the token carries, e.g. a torch: { "bright": 20, "dim": 20 }. */
  light: LightSchema.optional(),
  /** Hidden tokens are seen by the GM only. */
  hidden: z.boolean().default(false),
  /** When set, only these players (and the GM) see the token. Used by illusions. */
  visibleTo: z.array(id).optional(),
  /** SRD monster id whose stat block this token uses, e.g. "goblin-warrior". */
  monster: id.optional(),
  /** Character stats, or overrides for the monster's stat block. */
  stats: StatsSchema.optional(),
  /** Current hit points; missing means unhurt. */
  hp: z.number().int().optional(),
  /** A character's death saves while at 0 hp; cleared once it's healed. */
  deathSaves: z
    .object({
      successes: z.number().int().min(0).max(3),
      failures: z.number().int().min(0).max(3),
      stable: z.boolean().optional(),
      dead: z.boolean().optional(),
    })
    .optional(),
  /** Temporary hit points: lost first, and don't stack. */
  tempHp: z.number().int().positive().optional(),
  inventory: z.array(InventoryEntrySchema).optional(),
  /** Spells, conditions and features currently affecting the token. */
  effects: z.array(EffectSchema).optional(),
  /** The spell this creature is concentrating on. */
  concentration: z.object({ spell: id, name: z.string() }).optional(),
  /** Spell slots and feature uses spent since the last rest. */
  spent: z
    .object({
      /** Slots used per spell level, index 0 for 1st level. */
      slots: z.array(z.number().int().nonnegative()).optional(),
      /** Uses per feature id. */
      uses: z.record(z.string(), z.number().int().nonnegative()).optional(),
    })
    .optional(),
  /** Set on creatures a spell or feature brought in; they vanish when it ends. */
  summon: z.object({ by: id, spell: id, concentration: z.boolean().default(false) }).optional(),
  /** Acts on this token's turn instead of its own (summons, companions). */
  leader: id.optional(),
  /** How its controller arranged the action bar: one tile reference per slot ("spell:fire-bolt"), or null. */
  hotbar: z.array(z.string().max(80).nullable()).max(60).optional(),
});
export type Token = z.infer<typeof TokenSchema>;

/**
 * A creature kept in the GM's Actors list, ready to be placed on the map:
 * a token without a position. `folder` groups it in the list.
 */
export const ActorSchema = TokenSchema.omit({ x: true, y: true }).extend({ folder: z.string().min(1).optional() });
export type Actor = z.infer<typeof ActorSchema>;

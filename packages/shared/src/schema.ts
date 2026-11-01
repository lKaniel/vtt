import type { Ownership } from '@vtt/core';
import { z } from 'zod';

// The items in a game folder are described here (game.json and scene.json in
// game-schema.ts). The checker, the server and docs/game-format.md all follow
// these schemas.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');
/** Ids in a game folder: lowercase letters, digits and dashes. */
export const IdSchema = id;

export const PointSchema = z.tuple([z.number(), z.number()]);
export type Point = z.infer<typeof PointSchema>;

/**
 * What a seat may do at the table, like Foundry's user roles:
 * - gm: everything;
 * - trusted: a player who may also edit the tokens they own (their character sheet);
 * - player: plays the tokens they own;
 * - observer: watches through the party's eyes and reads their sheets, but acts on nothing.
 */
export const RoleSchema = z.enum(['gm', 'trusted', 'player', 'observer']);
export type Role = z.infer<typeof RoleSchema>;

export const PlayerSchema = z.object({
  id,
  name: z.string().min(1),
  role: RoleSchema,
  color: z.string().default('#8a8a8a'),
  /** The scene this seat is on when it isn't the game's (the GM sent them, or the GM is looking elsewhere). */
  scene: id.optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

/** A named elevation band of a scene: a cellar, the ground floor, an upper floor. */
export const SceneLevelSchema = z.object({
  id,
  name: z.string().min(1),
  /** Feet: a token at this elevation or above (and below the next level up) is on this level. */
  bottom: z.number(),
});
export type SceneLevel = z.infer<typeof SceneLevelSchema>;

/**
 * When it is on, by the scene's darkness (0 day, 1 night): `[0.6, 1]` is
 * "only at night". The game clock (a later step) drives darkness, so a band
 * follows the time of day through the same helper (`activeAt` in levels.ts).
 */
export const DarknessBandSchema = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

/** The scene level a map item is on (scene.json `levels`); missing = on every level. */
const onLevel = { level: id.optional() };

/** A scene's grid, camera start and lighting (scenes/<id>/scene.json, without its name). */
export const SceneSettingsSchema = z.object({
  /** Pixels per 5 ft: the side of a square when the scene has a grid. */
  gridSize: z.number().int().positive().default(100),
  /** Side of a streaming chunk, in pixels. Must be a multiple of gridSize. */
  chunkSize: z.number().int().positive().default(2000),
  /** Where the camera starts, in pixels. */
  start: PointSchema.default([0, 0]),
  /** How dark unlit areas are: 0 is full daylight, 1 is pitch black. */
  darkness: z.number().min(0).max(1).default(0),
  /** Fog of war: when true, players only see what their tokens can see. */
  vision: z.boolean().default(true),
  /** With fog of war, players keep seeing (dimmed) where they have been. Default true. */
  exploration: z.boolean().optional(),
  /**
   * "none" (the default): no grid, tokens walk anywhere and distances are
   * plain feet. "square": grid lines, tokens walk square to square, every
   * square (diagonals too) 5 ft.
   */
  grid: z.enum(['square', 'none']).optional(),
  /** Grid line colour (default black) and opacity (default 0.16). */
  gridColor: z.string().optional(),
  gridOpacity: z.number().min(0).max(1).optional(),
  /** What shows where nothing is drawn, e.g. "#1b1d22". */
  background: z.string().optional(),
  /** The time of day follows the game clock (world time, a later step); stored, not used yet. */
  darknessFollowsClock: z.boolean().optional(),
  /** Floors of the scene, bottom up (see levels.ts); none = one level. */
  levels: z.array(SceneLevelSchema).optional(),
  /** A playlist that starts when the game moves to this scene. */
  playlist: id.optional(),
});

/** The table settings the rules and the client use: the game's, plus those of the scene being played. */
export const WorldSchema = SceneSettingsSchema.extend({
  name: z.string().min(1),
  /** The game system's rules edition (see SystemDefinition in core); missing = the system's default. */
  rules: z.string().min(1).optional(),
  players: z.array(PlayerSchema).min(1),
});
export type World = z.infer<typeof WorldSchema>;

/** Where a tile sits in the tile tree (see tiles.ts). */
const tileTree = {
  id,
  name: z.string().optional(),
  /** The group or container tile it sits in; missing = the top level. */
  parent: id.optional(),
  /** Fractional key among its siblings: later draws on top (see sort-key.ts). */
  sort: z.string().optional(),
  /** Clicks and marquees pass through it; select it in the layers panel. */
  locked: z.boolean().optional(),
  ...onLevel,
};

const tileBase = {
  ...tileTree,
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  /** Ground: tiles dropped on it don't go inside it, and a drag starting on it draws a marquee. */
  background: z.boolean().optional(),
};

/** Painted ground for rect tiles, tinted by the tile's colour. */
export const TileTextureSchema = z.enum(['grass', 'dirt', 'sand', 'stone', 'cobble', 'wood', 'water', 'rock']);
export type TileTexture = z.infer<typeof TileTextureSchema>;

const RectTileSchema = z.object({
  kind: z.literal('rect'),
  ...tileBase,
  color: z.string(),
  texture: TileTextureSchema.optional(),
  /** Squares one repeat of the texture covers; default 2. */
  textureScale: z.number().positive().optional(),
  /** "rough" wobbles the edges (the default for grass, dirt, sand, water and rock); "straight" keeps them crisp. */
  edge: z.enum(['rough', 'straight']).optional(),
});
const ImageTileSchema = z.object({ kind: z.literal('image'), ...tileBase, src: z.string().min(1) });
/** A group of tiles: no picture or rect of its own, it spans what is in it. */
const GroupTileSchema = z.object({ kind: z.literal('group'), ...tileTree });

export const TileSchema = z.discriminatedUnion('kind', [RectTileSchema, ImageTileSchema, GroupTileSchema]);
export type Tile = z.infer<typeof TileSchema>;

/** A tile with a picture: what the map draws. */
export const DrawnTileSchema = z.discriminatedUnion('kind', [RectTileSchema, ImageTileSchema]);
export type DrawnTile = z.infer<typeof DrawnTileSchema>;

export const DoorStateSchema = z.enum(['closed', 'open', 'locked']);
export type DoorState = z.infer<typeof DoorStateSchema>;

/** How a wall stops movement: it does, or it doesn't (an illusory or ethereal wall). */
export const MoveRestrictionSchema = z.enum(['none', 'normal']);
/**
 * How a wall stops sight, light or sound (Foundry's wall senses): `none` lets
 * it through, `normal` stops it, `limited` lets it through one such wall but
 * not two (tall grass, a thin curtain), `proximity` lets it through only from
 * within the wall's `threshold` (a fence you peer over up close).
 */
export const SenseRestrictionSchema = z.enum(['none', 'normal', 'limited', 'proximity']);
export type SenseRestriction = z.infer<typeof SenseRestrictionSchema>;

/** Feet from the wall within which a proximity wall lets that sense through. */
const ThresholdSchema = z.object({
  sight: z.number().nonnegative().optional(),
  light: z.number().nonnegative().optional(),
  sound: z.number().nonnegative().optional(),
});

/** Old files marked windows `"sight": false` (movement only); that is sight and light `none` now. */
function oldWindow(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || typeof (raw as { sight?: unknown }).sight !== 'boolean') return raw;
  const { sight, ...rest } = raw as Record<string, unknown>;
  return sight ? rest : { light: 'none', ...rest, sight: 'none' };
}

/** What kind of wall it is: a door or not, and what it stops. */
export const WallRulesSchema = z.object({
  /** Present only on doors. An open door restricts nothing. */
  door: DoorStateSchema.optional(),
  /** What the wall stops; each missing one is `normal`. A window has sight and light `none`. */
  move: MoveRestrictionSchema.optional(),
  sight: SenseRestrictionSchema.optional(),
  light: SenseRestrictionSchema.optional(),
  sound: SenseRestrictionSchema.optional(),
  threshold: ThresholdSchema.optional(),
});
export type WallRules = z.infer<typeof WallRulesSchema>;

export const WallSchema = z.preprocess(
  oldWindow,
  z.object({ id, a: PointSchema, b: PointSchema, ...WallRulesSchema.shape, ...onLevel }),
);
export type Wall = z.infer<typeof WallSchema>;

/** Light radii are in feet, like the rules. */
export const LightSchema = z.object({
  bright: z.number().nonnegative(),
  dim: z.number().nonnegative().default(0),
  /** Colour of the light, e.g. "#ff9a40" for a torch. Missing means white. */
  color: z.string().optional(),
  /** How the light moves: a torch flickers, a magic glow pulses. */
  animation: z.enum(['flicker', 'pulse']).optional(),
  /** Magical darkness instead of light (the Darkness spell): nothing nonmagical lights it. */
  darkness: z.boolean().optional(),
});
export type Light = z.infer<typeof LightSchema>;

export const PlacedLightSchema = LightSchema.extend({
  id,
  x: z.number(),
  y: z.number(),
  ...onLevel,
  /** Shines only while the scene's darkness is in this band ("only at night"). */
  activeAt: DarknessBandSchema.optional(),
});
export type PlacedLight = z.infer<typeof PlacedLightSchema>;

export const ChunkSchema = z.object({
  /** `z`: where the tile draws among all the scene's tiles, set by the server. */
  tiles: z.array(DrawnTileSchema.and(z.object({ z: z.number().optional() }))).default([]),
  walls: z.array(WallSchema).default([]),
  lights: z.array(PlacedLightSchema).default([]),
});
export type Chunk = z.infer<typeof ChunkSchema>;

/**
 * What the engine knows of a token: where it stands, who may see it and the
 * light it carries. Its sheet (hit points, senses, conditions) belongs to the
 * game's system, which builds its token schema on these fields.
 */
export interface PlacedToken {
  id: string;
  x: number;
  y: number;
  /** Feet above the ground: which of the scene's levels it is on. */
  elevation?: number;
  ownership?: Ownership;
  hidden?: boolean;
  visibleTo?: string[];
  light?: Light;
}

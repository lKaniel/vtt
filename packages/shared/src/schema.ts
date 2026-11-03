import { IdSchema as id, type Ownership } from '@vtt/core';
import { z } from 'zod';
import { TileTriggerSchema } from './trigger-schema.ts';
import { WeatherSchema } from './weather.ts';
import { WeatherCycleSchema } from './weather-cycle.ts';
import { GRID_KINDS } from './grid.ts';
import { Model3DSchema } from './model3d.ts';

// The items in a game folder are described here (game.json and scene.json in
// game-schema.ts). The checker, the server and docs/game-format.md all follow
// these schemas.

/** Ids in a game folder: lowercase letters, digits and dashes (core's, so documents and files agree). */
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
  /** The seat's picture (`/assets/…`, `pack://…`), beside its chat. */
  avatar: z.string().max(500).optional(),
  /** The scene this seat is on when it isn't the game's (the GM sent them, or the GM is looking elsewhere). */
  scene: id.optional(),
  /** The seat's own options for this game, as its system names them (D&D: how reactions are offered). */
  settings: z.record(z.string().max(40), z.string().max(40)).optional(),
});
export type Player = z.infer<typeof PlayerSchema>;

/** A named elevation band of a scene: a cellar, the ground floor, an upper floor. */
export const SceneLevelSchema = z.object({
  id,
  name: z.string().min(1),
  /** Feet: a token at this elevation or above (and below the next level up) is on this level. */
  bottom: z.number(),
  /** Feet where it ends (its ceiling): how tall walls stand in 3D. Missing = the next level's bottom. */
  top: z.number().optional(),
  /** Other levels seen from this one, drawn beneath it (the floors below an open gallery). */
  sees: z.array(id).optional(),
});
export type SceneLevel = z.infer<typeof SceneLevelSchema>;

/**
 * When it is on, by the scene's darkness (0 day, 1 night): `[0.6, 1]` is
 * "only at night". The game clock (a later step) drives darkness, so a band
 * follows the time of day through the same helper (`activeAt` in levels.ts).
 */
export const DarknessBandSchema = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);

/** The scene level a map item is on (scene.json `levels`), or the several it is on; neither = on every level. */
const onLevel = { level: id.optional(), levels: z.array(id).optional() };

/** How the 3D view shows a scene. */
export const View3DSettingsSchema = z.object({
  /** A picture of the sky all round (equirectangular, like a panorama). */
  sky: z.string().optional(),
  /** The colour of the ground beyond the map. */
  ground: z.string().optional(),
  /** Stand the scene's walls up (default true); off when its models are the walls. */
  walls: z.boolean().optional(),
});
export type View3DSettings = z.infer<typeof View3DSettingsSchema>;

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
   * square (diagonals too) 5 ft. "hex-rows" (pointy top) and "hex-cols"
   * (flat top): tokens walk hex to hex, every hex 5 ft (see grid.ts).
   */
  grid: z.enum(GRID_KINDS).optional(),
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
  /** Rain, snow, clouds, fog, embers or birds over the map, in layers (see weather.ts). */
  weather: z.array(WeatherSchema).optional(),
  /** The weather changes with world time instead (see weather-cycle.ts); `weather` is ignored. */
  weatherCycle: WeatherCycleSchema.optional(),
  /** The 3D view of the scene (docs/view3d.md). */
  view3d: View3DSettingsSchema.optional(),
});

/** The table settings the rules and the client use: the game's, plus those of the scene being played. */
export const WorldSchema = SceneSettingsSchema.extend({
  name: z.string().min(1),
  /** The game system's rules edition (see SystemDefinition in core); missing = the system's default. */
  rules: z.string().min(1).optional(),
  /** The game's options, which its system reads (D&D: the encumbrance rule); missing = the defaults. */
  settings: z.record(z.string().max(40), z.string().max(40)).optional(),
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
  /** GM only: players don't get it (a trigger can show it). */
  hidden: z.boolean().optional(),
  /** Runs actions when it is clicked or walked onto (see triggers.ts). */
  trigger: TileTriggerSchema.optional(),
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
const ImageTileSchema = z.object({
  kind: z.literal('image'),
  ...tileBase,
  /** A picture, an animated GIF or a video (webm, mp4), which loops without sound. */
  src: z.string().min(1),
  /** A roof or canopy: drawn over creatures, and see-through while one of yours stands under it. */
  overhead: z.boolean().optional(),
  /** How opaque an overhead tile gets while a creature of yours is under it: 0 (gone, the default) to 1. */
  occludedAlpha: z.number().min(0).max(1).optional(),
  /** Pixels a second the picture slides by inside the tile (running water, clouds). */
  scroll: z.object({ x: z.number(), y: z.number() }).optional(),
  /** A soft shadow under the picture (trees, roofs): `offset` pixels down and right, blurred `blur` pixels. */
  shadow: z
    .object({
      offset: z.number().default(12),
      blur: z.number().nonnegative().default(8),
      alpha: z.number().min(0).max(1).default(0.5),
    })
    .optional(),
  /** A colour multiplied into the picture, e.g. "#88aaff" for moonlight. */
  tint: z.string().optional(),
  /** What stands on the tile in the 3D view (see model3d.ts); a model tile's picture is often blank. */
  model: Model3DSchema.optional(),
});
/** A group of tiles: no picture or rect of its own, it spans what is in it. */
const GroupTileSchema = z.object({ kind: z.literal('group'), ...tileTree });

export const TileSchema = z.discriminatedUnion('kind', [RectTileSchema, ImageTileSchema, GroupTileSchema]);
export type Tile = z.infer<typeof TileSchema>;

/** A tile with a picture: what the map draws. */
export const DrawnTileSchema = z.discriminatedUnion('kind', [RectTileSchema, ImageTileSchema]);
export type DrawnTile = z.infer<typeof DrawnTileSchema>;

export const DoorStateSchema = z.enum(['closed', 'open', 'locked']);
export type DoorState = z.infer<typeof DoorStateSchema>;

/** A wall or light fastened to a tile (a prefab house): moving, copying or deleting the tile takes it along. */
const onTile = { tile: id.optional() };

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
  /** A one-way wall: it stops only what comes from this side, looking from `a` to `b`. */
  dir: z.enum(['left', 'right']).optional(),
  /** A secret door: players see a plain wall until it is opened, and can't open it themselves. */
  secret: z.boolean().optional(),
  /** What a door sounds like: wood (the default), stone, iron, gate, none, or an audio file. */
  doorSound: z.string().min(1).optional(),
});
export type WallRules = z.infer<typeof WallRulesSchema>;

export const WallSchema = z.preprocess(
  oldWindow,
  z.object({
    id,
    a: PointSchema,
    b: PointSchema,
    ...WallRulesSchema.shape,
    /** Feet above the ground the wall stands between (Wall Height): a creature above `top` passes over. */
    height: z.object({ bottom: z.number().optional(), top: z.number().optional() }).optional(),
    ...onTile,
    ...onLevel,
  }),
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
  /** Degrees of the beam (a lantern, a lighthouse); missing: all round. */
  angle: z.number().gt(0).max(360).optional(),
  /** Which way the beam faces, degrees clockwise from facing down the map (south). */
  rotation: z.number().optional(),
  /** false: it shines through walls (a magical glow). */
  walls: z.boolean().optional(),
  /** How strongly it lights, 0 to 1 (default 1). */
  luminosity: z.number().min(0).max(1).optional(),
  /** How softly it fades out at its edges, 0 (a hard edge) to 1 (default 0.5). */
  attenuation: z.number().min(0).max(1).optional(),
  /** How much of its colour it casts, 0 (plain warm light) to 1 (default). */
  colorIntensity: z.number().min(0).max(1).optional(),
  /** What gives it, e.g. "Torch": named when it burns out. */
  name: z.string().optional(),
  /** Game seconds it burns once lit (a torch: 3600); missing: it never goes out (see light-time.ts). */
  lasts: z.number().positive().optional(),
  /** Game-clock second it goes out, worked out from `lasts` when it is lit. */
  endsAt: z.number().optional(),
});
export type Light = z.infer<typeof LightSchema>;

export const PlacedLightSchema = LightSchema.extend({
  id,
  x: z.number(),
  y: z.number(),
  ...onTile,
  ...onLevel,
  /** Shines only while the scene's darkness is in this band ("only at night"). */
  activeAt: DarknessBandSchema.optional(),
  /** Put out: it doesn't shine until a trigger (or the GM) lights it again. */
  hidden: z.boolean().optional(),
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

import { z } from 'zod';
import { DarknessBandSchema, IdSchema as id, PointSchema } from './schema.ts';
import { TRIGGER_ACTIONS } from './trigger-schema.ts';

// The scene's other placeables (design doc, "Walls, lights, fog and the rest
// of the scene"): drawings, map notes, templates, regions and ambient sounds.
// Each lives in scenes/<scene>/<collection>.json like tiles and walls do.
// Coordinates are map pixels; lengths the rules use (radii, distances) are feet.

/** Fields every one of them may have. */
const placed = {
  id,
  /** The scene level it is on (scene.json `levels`); missing = on every level. */
  level: id.optional(),
  /** GM only: players don't get it. */
  hidden: z.boolean().optional(),
  /** Clicks and marquees pass through it. */
  locked: z.boolean().optional(),
};

const colour = z.string().min(1);

const DrawingBase = {
  ...placed,
  /** Who drew it: a player may change and remove their own drawings. Missing = the GM's. */
  author: id.optional(),
  stroke: colour.optional(),
  /** Screen-independent line width, map pixels; 0 draws no outline. */
  strokeWidth: z.number().min(0).optional(),
  fill: colour.optional(),
  /** 0 to 1; default 0.35 when there is a fill. */
  fillAlpha: z.number().min(0).max(1).optional(),
};

/** A box: rectangle, ellipse or a text label. */
const BoxDrawing = z.object({
  shape: z.enum(['rect', 'ellipse', 'text']),
  ...DrawingBase,
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  text: z.string().optional(),
  fontSize: z.number().positive().optional(),
  textColor: colour.optional(),
});

/** Points joined up: a polygon (closed), a line (open) or freehand. */
const PathDrawing = z.object({
  shape: z.enum(['polygon', 'line', 'freehand']),
  ...DrawingBase,
  points: z.array(PointSchema).min(2),
});

export const DrawingSchema = z.discriminatedUnion('shape', [BoxDrawing, PathDrawing]);
export type Drawing = z.infer<typeof DrawingSchema>;

/** A map pin: a label, and the journal entry (and page) it opens. */
export const NoteSchema = z.object({
  ...placed,
  x: z.number(),
  y: z.number(),
  label: z.string().optional(),
  /** A symbol drawn on the pin (an emoji or a letter), or a picture's path. */
  icon: z.string().optional(),
  color: colour.optional(),
  /** The journal entry it opens; players see the pin only when they may see the entry. */
  entry: id.optional(),
  page: id.optional(),
});
export type Note = z.infer<typeof NoteSchema>;

/** A placed area: what spells and breath weapons cover, or a ruler left on the map. */
export const TemplateSchema = z.object({
  ...placed,
  shape: z.enum(['circle', 'cone', 'line', 'square']),
  /** The origin: the centre of a circle or square, the tip of a cone, the start of a line. */
  x: z.number(),
  y: z.number(),
  /** Feet: a circle's radius, a cone's or line's length, a square's side. */
  distance: z.number().positive(),
  /** Degrees clockwise from east, where cones and lines point (and squares turn). */
  direction: z.number().optional(),
  /** Feet across a line; default 5. */
  width: z.number().positive().optional(),
  /** Degrees across a cone; default 53.13 (as wide as it is long). */
  angle: z.number().positive().max(360).optional(),
  color: colour.optional(),
  author: id.optional(),
  /** It moves with this token (an emanation around its caster). */
  attachedTo: id.optional(),
  /** Set by the server on a lasting area some creature keeps up: the token and its effect. */
  effect: z.object({ token: id, id: z.string().min(1) }).optional(),
  /** Game-clock second it goes away; kept for world time (a later step), not read yet. */
  endsAt: z.number().optional(),
});
export type Template = z.infer<typeof TemplateSchema>;

/** What happens when a token enters a region. */
export const RegionBehaviorSchema = z.discriminatedUnion('type', [
  /** Moving through costs `multiplier` times as much (default 2). */
  z.object({ type: z.literal('difficult'), multiplier: z.number().min(1).optional() }),
  /** A trap: the game system works out `system` (a save, damage); `message` is said in chat. */
  z.object({
    type: z.literal('trap'),
    message: z.string().optional(),
    /** Springs once, then turns itself off. */
    once: z.boolean().optional(),
    system: z.record(z.string(), z.unknown()).optional(),
  }),
  /** Takes the token to another level of the scene (stairs, a ladder, a trapdoor). */
  z.object({ type: z.literal('level'), to: id }),
  /** Players whose token enters see the whole region as explored. */
  z.object({ type: z.literal('reveal') }),
  /** Teleport, message, door, sound, image, show/hide and journal: what a tile trigger does too. */
  ...TRIGGER_ACTIONS,
]);
export type RegionBehavior = z.infer<typeof RegionBehaviorSchema>;

/** An area of the scene with behaviours: difficult ground, a trap, a teleporter. */
export const RegionSchema = z.object({
  ...placed,
  name: z.string().optional(),
  points: z.array(PointSchema).min(3),
  color: colour.optional(),
  behaviors: z.array(RegionBehaviorSchema).default([]),
  /** Players see its outline (difficult ground they should know about). */
  visible: z.boolean().optional(),
  /** Off: nothing happens. */
  disabled: z.boolean().optional(),
  activeAt: DarknessBandSchema.optional(),
});
export type Region = z.infer<typeof RegionSchema>;

/** Ambient sound at a point: louder the nearer you are, muffled by walls. */
export const SoundSchema = z.object({
  ...placed,
  name: z.string().optional(),
  x: z.number(),
  y: z.number(),
  /** Feet you hear it from. */
  radius: z.number().positive(),
  /** An audio file: an asset path or a pack:// reference. */
  src: z.string().min(1),
  /** 0 to 1; default 0.5. */
  volume: z.number().min(0).max(1).optional(),
  /** Walls muffle it (default true); false: it carries through them. */
  walls: z.boolean().optional(),
  activeAt: DarknessBandSchema.optional(),
});
export type Sound = z.infer<typeof SoundSchema>;

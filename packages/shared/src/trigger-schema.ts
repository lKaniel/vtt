import { z } from 'zod';

// What a trigger does, like Monk's Active Tiles: a chain of actions that runs
// when a tile is clicked or walked onto, or when a token walks into a region
// (see triggers.ts, and the server's trigger-actions.ts).

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');
const point = z.tuple([z.number(), z.number()]);

/** A tile or creature an action moves. */
const movable = z.object({ coll: z.enum(['tiles', 'tokens']), id });

/** Something on the scene an action points at: a tile, token, region, drawing, note, sound or light. */
export const TriggerTargetSchema = z.object({
  coll: z.enum(['tiles', 'tokens', 'regions', 'drawings', 'notes', 'sounds', 'lights']),
  id,
});
export type TriggerTarget = z.infer<typeof TriggerTargetSchema>;

/** A tile or light an action turns: tiles turn about their centre, a light turns its beam. */
const turnable = z.object({ coll: z.enum(['tiles', 'lights']), id });

/** The actions a choice's answers run: every action but a choice. */
const PLAIN_ACTIONS = [
  /** The tile shows the next picture of `images`, round and round; no `tile`: the tile that was triggered. */
  z.object({ type: z.literal('image'), tile: id.optional(), images: z.array(z.string().min(1)).min(1) }),
  /** Shows, hides or flips whether players see something (a light: whether it shines). */
  z.object({ type: z.literal('visibility'), target: TriggerTargetSchema, to: z.enum(['show', 'hide', 'toggle']) }),
  /** Plays a sound once for everyone on the scene. */
  z.object({ type: z.literal('sound'), src: z.string().min(1), volume: z.number().min(0).max(1).optional() }),
  /** Moves the token that set it off to `to`, on this scene or on `scene`, and onto that scene's `level` when named. */
  z.object({ type: z.literal('teleport'), to: point, scene: id.optional(), level: id.optional() }),
  /** Takes the creature to another level of the scene (a ladder, a trapdoor), at that level's bottom. */
  z.object({ type: z.literal('level'), to: id }),
  /** Stairs or a ladder both ways: a creature on one of the two levels goes to the other. */
  z.object({ type: z.literal('stairs'), between: z.tuple([id, id]) }),
  /** Opens, closes, locks or flips a door by its wall id. */
  z.object({ type: z.literal('door'), wall: id, to: z.enum(['open', 'closed', 'locked', 'toggle']) }),
  /** Posts `text` in chat; `gmOnly` whispers it to the GM. */
  z.object({ type: z.literal('message'), text: z.string().min(1), gmOnly: z.boolean().optional() }),
  /** Turns a tile's trigger or a region off, on, or round. */
  z.object({
    type: z.literal('activate'),
    target: z.object({ coll: z.enum(['tiles', 'regions']), id }),
    to: z.enum(['on', 'off', 'toggle']),
  }),
  /**
   * Raises or lowers a tile (its model, when it has one) or a creature: to
   * `to` feet, or by `by`. No target: the creature that set it off. The
   * creatures standing on a tile ride with it (a lift).
   */
  z.object({
    type: z.literal('elevation'),
    target: movable.optional(),
    to: z.number().optional(),
    by: z.number().optional(),
  }),
  /** Slides a tile or a creature `by` pixels across the map (a sliding door). */
  z.object({ type: z.literal('shift'), target: movable, by: point }),
  /** Opens a journal entry (at `page`) on the screens of the players, and shares it with them. */
  z.object({ type: z.literal('journal'), entry: id, page: id.optional() }),
  /** Turns a tile, or a light's beam, to `to` degrees clockwise, or by `by`. */
  z.object({ type: z.literal('rotate'), target: turnable, to: z.number().optional(), by: z.number().optional() }),
  /** Shows `scene` to the player who set it off (and the players of the creature), or to `everyone`. */
  z.object({ type: z.literal('view'), scene: id, everyone: z.boolean().optional() }),
] as const;

/** One answer to a choice: its button, and what it runs. */
const ChoiceOptionSchema = z.object({
  label: z.string().min(1),
  actions: z.array(z.discriminatedUnion('type', PLAIN_ACTIONS)).default([]),
});

/** The actions a tile trigger runs, and a region runs too (scene-items.ts adds them to its behaviours). */
export const TRIGGER_ACTIONS = [
  ...PLAIN_ACTIONS,
  /**
   * Asks the player who set it off (or the players of the creature) to pick
   * one of `options` (Monk's dialog buttons), then runs that answer's
   * actions. The actions after it do not run.
   */
  z.object({
    type: z.literal('choice'),
    title: z.string().optional(),
    text: z.string().min(1),
    options: z.array(ChoiceOptionSchema).min(1).max(8),
  }),
] as const;

export const TriggerActionSchema = z.discriminatedUnion('type', TRIGGER_ACTIONS);
export type TriggerAction = z.infer<typeof TriggerActionSchema>;

/** A tile's trigger: what it runs, and when. */
export const TileTriggerSchema = z.object({
  /** "click": a player (or the GM) clicks it; "enter": a token walks onto it. */
  on: z.enum(['click', 'enter']).default('click'),
  actions: z.array(TriggerActionSchema).default([]),
  /** Runs once, then turns itself off. */
  once: z.boolean().optional(),
  /** Only the GM may click it. */
  gmOnly: z.boolean().optional(),
  /** A creature of the one clicking must stand within this many pixels of the tile (0: on it); the GM's need not. */
  near: z.number().nonnegative().optional(),
  /** Off: nothing happens. */
  disabled: z.boolean().optional(),
});
export type TileTrigger = z.infer<typeof TileTriggerSchema>;

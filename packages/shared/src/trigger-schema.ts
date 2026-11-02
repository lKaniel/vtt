import { z } from 'zod';

// What a trigger does, like Monk's Active Tiles: a chain of actions that runs
// when a tile is clicked or walked onto, or when a token walks into a region
// (see triggers.ts, and the server's trigger-actions.ts).

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');
const point = z.tuple([z.number(), z.number()]);

/** Something on the scene an action points at: a tile, token, region, drawing, note or sound. */
export const TriggerTargetSchema = z.object({
  coll: z.enum(['tiles', 'tokens', 'regions', 'drawings', 'notes', 'sounds']),
  id,
});
export type TriggerTarget = z.infer<typeof TriggerTargetSchema>;

/** The actions a tile trigger runs, and a region runs too (scene-items.ts adds them to its behaviours). */
export const TRIGGER_ACTIONS = [
  /** The tile shows the next picture of `images`, round and round; no `tile`: the tile that was triggered. */
  z.object({ type: z.literal('image'), tile: id.optional(), images: z.array(z.string().min(1)).min(1) }),
  /** Shows, hides or flips whether players see something. */
  z.object({ type: z.literal('visibility'), target: TriggerTargetSchema, to: z.enum(['show', 'hide', 'toggle']) }),
  /** Plays a sound once for everyone on the scene. */
  z.object({ type: z.literal('sound'), src: z.string().min(1), volume: z.number().min(0).max(1).optional() }),
  /** Moves the token that set it off to `to`, on this scene or on `scene`. */
  z.object({ type: z.literal('teleport'), to: point, scene: id.optional() }),
  /** Opens, closes, locks or flips a door by its wall id. */
  z.object({ type: z.literal('door'), wall: id, to: z.enum(['open', 'closed', 'locked', 'toggle']) }),
  /** Posts `text` in chat; `gmOnly` whispers it to the GM. */
  z.object({ type: z.literal('message'), text: z.string().min(1), gmOnly: z.boolean().optional() }),
  /** Opens a journal entry (at `page`) on the screens of the players, and shares it with them. */
  z.object({ type: z.literal('journal'), entry: id, page: id.optional() }),
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
  /** Off: nothing happens. */
  disabled: z.boolean().optional(),
});
export type TileTrigger = z.infer<typeof TileTriggerSchema>;

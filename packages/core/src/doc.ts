import { z } from 'zod';
import { DocSchema, IdSchema } from './ops.ts';

// The shapes every game document builds on. A placeable is a document that
// sits on a scene: tiles, tokens, walls, lights, sounds, drawings, notes,
// regions and templates.

/**
 * How much of a document an account may see or do, like Foundry's levels:
 * none (doesn't know it exists), limited (sees it, not its details),
 * observer (sees everything), owner (edits it and acts with it).
 */
export const LevelSchema = z.enum(['none', 'limited', 'observer', 'owner']);
export type Level = z.infer<typeof LevelSchema>;

/** `default` for everyone (limited unless it says otherwise), plus a level per account id. */
export const OwnershipSchema = z.object({ default: LevelSchema.default('limited') }).catchall(LevelSchema);
export type Ownership = z.infer<typeof OwnershipSchema>;

/**
 * The level `account` has on a document; one that says nothing is seen but
 * not read. Roles (a GM sees everything) are applied on top of this.
 */
export function levelFor(ownership: Ownership | undefined, account: string): Level {
  if (!ownership) return 'limited';
  return ownership[account] ?? ownership.default;
}

/** Fields shared by every stored document. */
export const BaseDocSchema = DocSchema.extend({
  name: z.string().optional(),
  /** Folder in the sidebar directory. */
  folder: IdSchema.optional(),
  /** Fractional index among siblings (see sort-key.ts). */
  sort: z.string().optional(),
  ownership: OwnershipSchema.optional(),
  /** Free space for systems, modules and notes. */
  flags: z.record(z.string(), z.unknown()).optional(),
});
export type BaseDoc = z.infer<typeof BaseDocSchema>;

/** Fields shared by everything placed on a scene. Coordinates are absolute scene pixels. */
export const PlaceableSchema = BaseDocSchema.extend({
  scene: IdSchema,
  /** The group or container tile it sits in; missing = the top level of its layer. */
  parent: IdSchema.optional(),
  x: z.number(),
  y: z.number(),
  /** Feet above the ground, for levels and flying. */
  elevation: z.number().default(0),
  /** Only the GM sees it. */
  hidden: z.boolean().default(false),
  /** Can't be marquee-selected or dragged by accident. */
  locked: z.boolean().default(false),
});
export type Placeable = z.infer<typeof PlaceableSchema>;

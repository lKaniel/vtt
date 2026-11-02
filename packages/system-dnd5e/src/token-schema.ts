import { IdSchema as id, OwnershipSchema } from '@vtt/core';
import { LightSchema } from '@vtt/shared';
import { EffectSchema, FeatureSchema, SpellSchema } from './spell-schema.ts';
import { CurrencySchema, InventorySchema, ItemSchema, StatsSchema } from './stats-schema.ts';
import { z } from 'zod';

// A D&D creature as it is stored: a token in a scene's tokens.json (where it
// stands plus its sheet) and an actor in actors/<id>.json (the sheet alone).
// The engine only knows the placement fields; the rest is this system's.

/**
 * Items, spells and features made on this sheet (homebrew), as Foundry keeps
 * them on the actor: read as if they were in the compendium (see
 * own-content.ts). Own spells are known and own features granted; an own
 * item still needs an inventory entry.
 */
export const OwnSchema = z.object({
  items: z.array(ItemSchema).optional(),
  spells: z.array(SpellSchema).optional(),
  features: z.array(FeatureSchema.extend({ level: FeatureSchema.shape.level.default(1) })).optional(),
});
export type Own = z.infer<typeof OwnSchema>;

export const TokenSchema = z.object({
  id,
  name: z.string().min(1),
  /** Centre of the token, in pixels. */
  x: z.number(),
  y: z.number(),
  /** Feet above the ground (the scene's levels, flying); none = 0. */
  elevation: z.number().optional(),
  /** Size in squares (1 = medium, 2 = large). */
  size: z.number().positive().default(1),
  color: z.string().default('#b04a3a'),
  img: z.string().optional(),
  /** Walking speed in feet. */
  speed: z.number().nonnegative().default(30),
  /**
   * Who may see, read and act with it: a level per player id, and `default`
   * for everyone else (see permissions.ts). Missing: everyone sees it, nobody
   * but the GM owns it.
   */
  ownership: OwnershipSchema.optional(),
  /** Darkvision range in feet; 0 for none. */
  darkvision: z.number().nonnegative().default(0),
  /** Other senses, in feet. Missing ones fall back to the monster's stat block. */
  blindsight: z.number().nonnegative().optional(),
  tremorsense: z.number().nonnegative().optional(),
  truesight: z.number().nonnegative().optional(),
  /** Sees normally in magical and nonmagical darkness to this range (the warlock invocation). */
  devilsSight: z.number().nonnegative().optional(),
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
  /** Levels of exhaustion, 1 to 6 (6 is death); a long rest takes one away. */
  exhaustion: z.number().int().min(1).max(6).optional(),
  /** Temporary hit points: lost first, and don't stack. */
  tempHp: z.number().int().positive().optional(),
  inventory: InventorySchema.optional(),
  currency: CurrencySchema.optional(),
  own: OwnSchema.optional(),
  /** Spells, conditions and features currently affecting the token. */
  effects: z.array(EffectSchema).optional(),
  /** The spell this creature is concentrating on. */
  concentration: z.object({ spell: id, name: z.string(), endsAt: z.number().optional() }).optional(),
  /** Spell slots and feature uses spent since the last rest. */
  spent: z
    .object({
      /** Slots used per spell level, index 0 for 1st level. */
      slots: z.array(z.number().int().nonnegative()).optional(),
      /** Uses per feature id. */
      uses: z.record(z.string(), z.number().int().nonnegative()).optional(),
      /** Hit dice spent on short rests. */
      hitDice: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /** Set on creatures a spell or feature brought in; they vanish when it ends. */
  summon: z
    .object({ by: id, spell: id, concentration: z.boolean().default(false), endsAt: z.number().optional() })
    .optional(),
  /** Acts on this token's turn instead of its own (summons, companions). */
  leader: id.optional(),
  /** How its controller arranged the action bar: one tile reference per slot ("spell:fire-bolt"), or null. */
  hotbar: z.array(z.string().max(80).nullable()).max(60).optional(),
  /** The actor this token stands for (see token-link.ts); missing on a token that carries its own sheet. */
  actor: id.optional(),
  /** Linked tokens share their actor's hit points and effects; unlinked ones are copies with their own. */
  linked: z.boolean().optional(),
});
export type Token = z.infer<typeof TokenSchema>;

/**
 * A creature's sheet, in the GM's Actors list (actors/<id>.json): what its
 * tokens look like and are, without a position. `folder` groups it in the
 * list; `linked` says whether new tokens of it share its hit points and
 * effects (default: linked unless it is a monster).
 */
export const ActorSchema = TokenSchema.omit({ x: true, y: true, actor: true }).extend({
  folder: z.string().min(1).optional(),
});
export type Actor = z.infer<typeof ActorSchema>;

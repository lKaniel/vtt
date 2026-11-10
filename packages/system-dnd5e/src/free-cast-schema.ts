import { z } from 'zod';

// One spell a feature casts without a slot (Feature `freeCasts`, free-casts.ts),
// and the spells a player picks for a feature to cast so (Feature `spellPicks`, spell-picks.ts).

export const FreeCastSchema = z.object({
  spell: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes'),
  /** The level it goes off at; missing: the spell's own. */
  level: z.number().int().min(1).max(9).optional(),
  /** It lands on the caster only. */
  self: z.boolean().optional(),
  /** Cast before a fight, never in one: its effect is already in the stat block (mage armor in its AC). */
  beforeCombat: z.boolean().optional(),
  /** Points from the class's pool it costs instead of a use of the feature: a formula in `level`, the level it is cast at. */
  cost: z.string().max(200).optional(),
});

const level = z.number().int().min(1).max(9);

/**
 * Spells the player picks for a feature to cast without a slot, each at its
 * own level (Mystic Arcanum, Spell Mastery, Signature Spells): one per
 * choice, from the class level it comes at, of exactly `level` or up to
 * `maxLevel`. Kept on the sheet (`stats.spellPicks`), or with `atCast` any
 * spell that fits, picked as it is cast (Divine Intervention).
 */
export const SpellPicksSchema = z.object({
  /** The class's spell list, or the spells the character knows (a spellbook). */
  from: z.enum(['class', 'known']),
  /** The class whose list it is (from `class`). */
  class: z.string().optional(),
  choices: z
    .array(
      z.object({ at: z.number().int().min(1).max(20).default(1), level: level.optional(), maxLevel: level.optional() }),
    )
    .min(1),
  atCast: z.boolean().optional(),
  /** Spells cast as a reaction don't fit. */
  noReactions: z.boolean().optional(),
});
export type SpellPicks = z.infer<typeof SpellPicksSchema>;

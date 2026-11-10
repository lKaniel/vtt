import { z } from 'zod';

// One spell a feature casts without a slot (Feature `freeCasts`, free-casts.ts).

export const FreeCastSchema = z.object({
  spell: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes'),
  /** The level it goes off at; missing: the spell's own. */
  level: z.number().int().min(1).max(9).optional(),
  /** It lands on the caster only. */
  self: z.boolean().optional(),
  /** Cast before a fight, never in one: its effect is already in the stat block (mage armor in its AC). */
  beforeCombat: z.boolean().optional(),
});

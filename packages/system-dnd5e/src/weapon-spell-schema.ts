import { z } from 'zod';
import { ABILITIES, DamageTypeSchema } from './stats-schema.ts';

/**
 * How a spell changes its bearer's weapon attacks (shillelagh, 2024 true
 * strike): the weapons it works on (none: any), their damage dice, the
 * ability they hit with, their damage type, and extra damage on a hit.
 */
export const WeaponSpellSchema = z.object({
  weapons: z.array(z.string().min(1)).default([]),
  dice: z.array(z.string().min(1)).optional(),
  ability: z.enum(ABILITIES).optional(),
  type: DamageTypeSchema.optional(),
  extra: z.object({ dice: z.array(z.string()), type: DamageTypeSchema }).optional(),
});

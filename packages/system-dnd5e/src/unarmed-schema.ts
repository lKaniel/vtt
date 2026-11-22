import { z } from 'zod';
import { LevelTableSchema } from './class-fields.ts';
import { ABILITIES, DamageTypeSchema } from './stats-schema.ts';

// Fields for fighting unarmed (a monk's martial arts) and for what an effect
// makes of those blows: summoned arms that strike with another ability and
// damage type (arms of the astral self). The engine runs them in unarmed.ts.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');
const ability = z.enum(ABILITIES);

/** Effect fields. */
export const unarmedEffectFields = {
  /**
   * An unarmed attack of its own while it lasts (astral arms): the bearer's
   * unarmed strike by `name`, using `ability` when it is better than Strength
   * or Dexterity, dealing `type` and reaching `reach` feet further.
   */
  unarmedAttack: z
    .object({
      name: z.string().min(1),
      ability: ability.optional(),
      type: DamageTypeSchema.optional(),
      reach: z.number().int().positive().optional(),
    })
    .optional(),
  /** Once on each of the bearer's turns, a hit with an `unarmedAttack` deals one more of its damage die (empowered arms). */
  unarmedOnceDie: z.boolean().optional(),
  /** Checks and saves of ability `of` use the modifier of `use` instead when it is higher (arms of the astral self). */
  abilityInPlace: z.object({ of: ability, use: ability }).optional(),
};

/** Feature fields. */
export const unarmedFeatureFields = {
  /** Unarmed strikes use this die by class level and the better of Strength and Dexterity, even with a weapon in hand (martial arts). */
  martialArts: LevelTableSchema.optional(),
  /** Uses it spends at once (of `usesFrom` when set): 5 ki for an awakened astral self. */
  usesCost: z.number().int().min(2).optional(),
  /** It can only be used while the effects of these features (by id) are on the creature (body of the astral self). */
  needsEffects: z.array(id).min(1).optional(),
};

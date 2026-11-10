import { z } from 'zod';
import { FeatureSchema } from './spell-schema.ts';
import { AbilitiesSchema, ABILITIES, AttackSchema, defenseFields, legendaryFields } from './stats-schema.ts';

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');

/** A line of the stat block the GM reads and runs: a trait, or an action, bonus action or reaction. */
export const MonsterTraitSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  kind: z.enum(['action', 'bonus', 'reaction']).optional(),
});
export type MonsterTrait = z.infer<typeof MonsterTraitSchema>;

const feet = z.number().positive();
export const MonsterSpeedsSchema = z
  .object({ fly: feet, swim: feet, climb: feet, burrow: feet, hover: z.boolean() })
  .partial();

/** How a monster casts: its stat block's numbers, the slots it has and every spell it can cast. */
export const MonsterCastingSchema = z.object({
  ability: z.enum(ABILITIES),
  /** Spell save DC and attack bonus; missing: worked out from the ability. */
  dc: z.number().int().positive().optional(),
  attack: z.number().int().optional(),
  /** Caster level, which cantrips grow with. */
  level: z.number().int().positive().optional(),
  /** Slots per spell level (index 0 = 1st). */
  slots: z.array(z.number().int().nonnegative()).optional(),
  /** Spell ids: prepared ones cast with slots, and those its features cast at will or so many times a day. */
  spells: z.array(id),
});
export type MonsterCasting = z.infer<typeof MonsterCastingSchema>;

export const MonsterSchema = z.object({
  id,
  name: z.string().min(1),
  /** Squares per side: 1 for small and medium, 2 for large. */
  size: z.number().positive().default(1),
  ac: z.number().int(),
  hp: z.number().int().positive(),
  speed: z.number().nonnegative().default(30),
  darkvision: z.number().nonnegative().default(0),
  blindsight: z.number().nonnegative().default(0),
  tremorsense: z.number().nonnegative().default(0),
  truesight: z.number().nonnegative().default(0),
  abilities: AbilitiesSchema,
  /** Creature type, e.g. "humanoid" or "beast". */
  type: z.string().optional(),
  /** Challenge rating, e.g. 0.25 for CR 1/4. */
  cr: z.number().nonnegative(),
  /** Saving throws the monster is proficient in. */
  saves: z.array(z.enum(ABILITIES)).default([]),
  attacks: z.array(AttackSchema).default([]),
  /** Attacks it makes with the Attack action (a spell's creature: half the spell's level). */
  multiattack: z.number().int().positive().optional(),
  ...defenseFields,
  conditionImmunities: z.array(z.string()).default([]),
  ...legendaryFields,
  /** What it has that the engine doesn't run, as the stat block words it: traits, reactions, odd actions. */
  traits: z.array(MonsterTraitSchema).optional(),
  /** Actions the engine runs like class features: breath weapons and other actions behind a saving throw. */
  features: z.array(FeatureSchema).optional(),
  spellcasting: MonsterCastingSchema.optional(),
  alignment: z.string().optional(),
  /** Skills it is proficient in, and those it adds its proficiency to twice. */
  skills: z.array(id).optional(),
  expertise: z.array(id).optional(),
  languages: z.array(z.string()).optional(),
  /** Flying, swimming, climbing and burrowing speeds in feet. */
  speeds: MonsterSpeedsSchema.optional(),
  /** Painted top-down token with a transparent background, set from content/token-art.json. */
  img: z.string().optional(),
});
export type Monster = z.infer<typeof MonsterSchema>;

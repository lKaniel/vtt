import { z } from 'zod';
import { ABILITIES } from './stats-schema.ts';

// Point pools for homebrew classes: a class spends points from one pool on
// its features instead of slots or uses (an illusionist's Lucidity). A
// feature's cost is a formula (formula.ts) over the creatures it targets,
// the options picked when it is used (senses, bolt shapes) and numbers its
// user enters; the pool, the creature "weight" costs are counted in and the
// fields features and spells gain are here. The engine is in pools.ts and
// powers.ts.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');
const level = z.number().int().min(1).max(20);
/** A number that grows with class level, fractions allowed: [[1, 1], [3, 1.5]]. */
export const LevelNumbersSchema = z.array(z.tuple([level, z.number().nonnegative()]));
export type LevelNumbers = z.infer<typeof LevelNumbersSchema>;

/**
 * How heavy a creature is for costs (an illusionist's Mind Weight): the tier
 * of its challenge rating or character level (the last `[from, tier]` it
 * reaches) times `base` + `per` × its `ability` modifier, at least `min`.
 */
export const WeightSchema = z.object({
  name: z.string().min(1).default('Weight'),
  tiers: z.array(z.tuple([z.number().nonnegative(), z.number().positive()])).min(1),
  ability: z.enum(ABILITIES).optional(),
  base: z.number().default(1),
  per: z.number().default(0),
  min: z.number().nonnegative().default(0),
});
export type Weight = z.infer<typeof WeightSchema>;

export const PoolSchema = z.object({
  id,
  name: z.string().min(1),
  /** Points by class level. */
  max: z.array(z.tuple([level, z.number().int().nonnegative()])).min(1),
  /** Back in full on a short rest, or only on a long one. */
  recharge: z.enum(['short', 'long']).default('long'),
  /** The share of the pool that held features may cost at once (Concurrent Lucidity: 0.5). */
  concurrent: z.number().positive().max(1).optional(),
  /** The ability the class's features use: DC 8 + proficiency + modifier, attacks proficiency + modifier. */
  ability: z.enum(ABILITIES),
  weight: WeightSchema.optional(),
  /** How much of a reserving feature's cost comes off the maximums, by class level (Steady Glamour: 0.5 from 9th). */
  reserveTimes: LevelNumbersSchema.optional(),
});
export type Pool = z.infer<typeof PoolSchema>;

/** A pick offered when the feature is used; it costs `cost` and sets spell fields over the feature's spell. */
export const PowerOptionSchema = z.object({
  id,
  name: z.string().min(1),
  /** The class level it's learned at (a character may have learned it early: "<class>/<option>" in `stats.features`). */
  level: level.default(1),
  /** Added to the group's number: a number or a formula (weight, first, level). */
  cost: z.union([z.number(), z.string()]).default(0),
  /** Spell fields set over the feature's spell; an `effect` adds to its effect instead of replacing it. */
  set: z.record(z.string(), z.unknown()).optional(),
  /** The damage is multiplied by this (an overcharged bolt: 2). */
  times: z.number().positive().optional(),
  /** More it sets from a class level (Lingering Pain). */
  upgrades: z.array(z.object({ level, set: z.record(z.string(), z.unknown()) })).optional(),
  /** What the GM still does by hand when it's picked. */
  note: z.string().optional(),
});
export type PowerOption = z.infer<typeof PowerOptionSchema>;

/** Options of one kind (senses, shapes): the sum of the picked ones' costs is the formula's `id`. */
export const OptionGroupSchema = z.object({
  id,
  name: z.string().min(1),
  /** "one": exactly one is picked; "any": any number, none too unless `required`. */
  pick: z.enum(['one', 'any']).default('any'),
  required: z.boolean().default(false),
  list: z.array(PowerOptionSchema).min(1),
});
export type OptionGroup = z.infer<typeof OptionGroupSchema>;

/** A number the user enters when using the feature (a size, a strength), the formula's `id`. */
export const PowerInputSchema = z.object({
  id,
  name: z.string().min(1),
  min: z.number().default(0),
  default: z.number().default(1),
});
export type PowerInput = z.infer<typeof PowerInputSchema>;

/** Fields class features gain for pools. */
export const powerFeatureFields = {
  /**
   * What using it costs from the class's pool: a formula, worked out once for
   * each target and added up. Names: `weight` (the target's), `first` (1 for
   * the first target), `linked` (1 if it's linked to the user), `level`, the
   * inputs and the option groups.
   */
  cost: z.string().optional(),
  /** The cost once its uses are spent (Rewrite: weight × 10); without it, no uses left means no use. */
  costWhenSpent: z.string().optional(),
  /** Each target linked to the user costs this times as much (bolt shapes: 0.5). */
  linkedTimes: z.number().nonnegative().optional(),
  inputs: z.array(PowerInputSchema).optional(),
  options: z.array(OptionGroupSchema).optional(),
  /** Its cost stays held against the pool's concurrent share while its effects last (a Weave). */
  hold: z.boolean().optional(),
  /** Its cost comes off the pool's maximums instead, until it's let go (a Glamour). */
  reserve: z.boolean().optional(),
  /** Features with the same group share one concentration: using one keeps the others going (Weaves). */
  group: id.optional(),
  /** The damage multiplier by class level (bolt multiplier). */
  times: LevelNumbersSchema.optional(),
  /** "{mod}" in its spell counts the pool ability's modifier only from this class level (before it, 0). */
  modFrom: level.optional(),
  /** Feature fields set over it from a class level (range, duration, radius); a `spell` adds to its spell. */
  upgrades: z.array(z.object({ level, set: z.record(z.string(), z.unknown()) })).optional(),
  /** It may be used as a bonus action instead when it costs this share of the pool's maximum or less (Quick Weave). */
  quick: z.number().positive().max(1).optional(),
  /** Once a turn it may be used as a bonus action whatever it costs (Fluid Weaving). */
  quickAny: z.boolean().optional(),
  /** After using it with an action, this feature may be used as a bonus action this turn (Twin Thought). */
  followUp: id.optional(),
  /** Only outside fights: it takes minutes (a Glamour's ritual). */
  ritual: z.boolean().optional(),
  /** Using it lets go of the user's newest held use of this feature (Glamour Bomb ends a Glamour). */
  consumes: id.optional(),
};

/** Fields spells gain for pool features. */
export const powerSpellFields = {
  /** Every damage roll is multiplied by this, rounded down (a bolt multiplier). */
  damageTimes: z.number().positive().optional(),
  /** Creatures with less Intelligence than this are immune (mindless creatures). */
  minInt: z.number().int().positive().optional(),
  /** Only creatures linked to the caster may be targets, at any distance. */
  linkedOnly: z.boolean().optional(),
  /** Only creatures of at most this weight (see the pool's `weight`) are affected. */
  maxWeight: z.number().positive().optional(),
  /** One attack against the first target; on a hit its damage is shared out evenly among all the targets (Fractured Bolt). */
  split: z.boolean().optional(),
  /** When it damages at least `atLeast` creatures, each makes this save or gets the effect (Phantasmal Barrage). */
  crowd: z
    .object({
      atLeast: z.number().int().min(2),
      ability: z.enum(ABILITIES),
      effect: z.record(z.string(), z.unknown()),
    })
    .optional(),
};

/** Fields effects gain for pool features. */
export const powerEffectFields = {
  /** The bearer is linked to the effect's source (a Weave's open channel). */
  linked: z.boolean().optional(),
  /** The held pool use (`holds` on the source) this effect keeps going. */
  hold: z.string().optional(),
  /** The bearer can't take reactions. */
  noReactions: z.boolean().optional(),
  /** Saves the bearer makes against effects with these conditions have advantage (Mind's Eye: charmed, frightened). */
  conditionSaveAdvantage: z.array(z.string()).optional(),
  /** With `followUp`: the feature its bearer may use as a bonus action this turn (Twin Thought). */
  bonusFeature: id.optional(),
};

/** A pool use that lasts: what it costs and whether that comes off the maximums. */
export const HoldSchema = z.object({
  id,
  feature: id,
  name: z.string().min(1),
  cost: z.number().nonnegative(),
  reserve: z.boolean().optional(),
});
export type Hold = z.infer<typeof HoldSchema>;

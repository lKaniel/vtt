import { z } from 'zod';
import { ABILITIES } from './stats-schema.ts';

// Fields for classes built around a pool of points and a die pool it feeds:
// a jaeger's focus points, the momentum dice spending them builds, the
// finishers that spend those dice, and the reactions bought with a point.
// The engine runs them in momentum.ts, finishers.ts and focus-arts.ts.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');
const count = z.number().int().positive();

export const LevelTableSchema = z.array(z.tuple([z.number().int().min(1).max(20), z.number().int()]));
export type LevelTable = z.infer<typeof LevelTableSchema>;

/** What a finisher does with the momentum dice it spends. */
const FINISHERS = ['damage', 'condition', 'bleed', 'chase', 'claw', 'volley', 'cleave', 'drain'] as const;

/** Hit reactions a feature can be (a point each): block damage with a weapon, or step out of the way. */
const HIT_ARTS = ['parry', 'dodge'] as const;
export type HitArt = (typeof HIT_ARTS)[number];

/** What sets a trigger off: the creature becoming bloodied, or an ally of its dropping to 0 hit points. */
const TRIGGERS = ['bloodied', 'ally-down'] as const;

/** The feature fields; `effect` is the effect template schema (passed in to keep the files apart). */
export const classFields = <E extends z.ZodType>(effect: E) => ({
  /** A die pool spending uses of feature `from` builds, a die per use (momentum); its die size is the feature's `die`. */
  momentum: z.object({ from: id }).optional(),
  /**
   * Spends every momentum die: on a hit with the attack it rides on (`hit`),
   * or as the feature's own action. `does` says what the dice do.
   */
  finisher: z
    .object({
      when: z.enum(['hit', 'action']),
      does: z.enum(FINISHERS),
      /** Only with a melee weapon with this property (great cleave: two-handed). */
      needs: z.literal('two-handed').optional(),
    })
    .optional(),
  /** A focus art a Chapter grants rather than one picked (spell flurry, prayer of salvation). */
  art: z.boolean().optional(),
  /**
   * What it adds to focus arts: Weapon Parry blocks half the class level more
   * and strikes back with what's left over (`counter`); Dodge Step always
   * succeeds; spending a point on an art gives advantage on the next weapon attack.
   */
  artBoost: z
    .object({
      parryBonus: z.literal('half-level'),
      counter: z.boolean(),
      sureDodge: z.boolean(),
      advantageAfter: z.boolean(),
    })
    .partial()
    .optional(),
  /** On `on`: focus points back and momentum dice gained, then not again for `cooldown` rounds (crimson rage). */
  trigger: z
    .object({ on: z.enum(TRIGGERS), focus: count.optional(), momentum: count.optional(), cooldown: count })
    .optional(),
  /** After any finisher the target makes a Strength save or falls prone, Large or larger at disadvantage. */
  finisherProne: z.boolean().optional(),
  /** Using it doubles the momentum dice held, to one more than the most (titanic strength). */
  doublesMomentum: z.boolean().optional(),
  /** The momentum die is a size larger while wielding a two-handed melee weapon (marauder momentum). */
  dieStep: z.literal('two-handed').optional(),
  /** Its `spell` from a class level on, these fields set over it (purifying salvation's third target). */
  spellAt: z.array(z.tuple([z.number().int().min(1).max(20), z.record(z.string(), z.unknown())])).optional(),
  /** An effect the creature has while bloodied (half its hit points or fewer, but up): blood frenzy. */
  whileBloodied: effect.optional(),
  /** A reaction to an attack about to hit, for one use: parry (block its damage) or dodge (a Dex save to evade). */
  hitArt: z.enum(HIT_ARTS).optional(),
  /** A spent use comes back on a natural 20 against a foe, and one when initiative is rolled with none left. */
  regain: z.object({ nat20: z.boolean(), initiative: z.boolean() }).partial().optional(),
  /** Picking it gives another feature more uses (focused fighting: a focus point). */
  moreUses: z.object({ of: id, by: count }).optional(),
  /** Picking it gives another of the class's choices more picks (focused fighting: a focus art). */
  morePicks: z.object({ of: id, by: count }).optional(),
  /** Momentum dice it gives on use, on top of the one its spent point gives (flourish). */
  grantsMomentum: count.optional(),
  /** Momentum dice for the first hit on your turn and for each creature you drop (lethal tempo). */
  momentumOn: z.object({ firstHit: count, kill: count }).partial().optional(),
  /** The `spell` save DC: 8 + proficiency + the best modifier of these abilities. */
  dcFrom: z.array(z.enum(ABILITIES)).optional(),
  /** Its effect at a class level, the highest reached winning over `effect` (piercing gaze). */
  effectAt: z.array(z.tuple([z.number().int().min(1).max(20), effect])).optional(),
  /** Using it gives half the creature's speed as extra movement (hunter's pursuit). */
  halfDash: z.boolean().optional(),
});

/** Effect fields for senses and for those classes. */
export const momentumEffectFields = {
  /** Senses the effect grants, in feet (darkvision spell), or the power to see invisible things. */
  senses: z
    .object({
      darkvision: z.number().nonnegative(),
      blindsight: z.number().nonnegative(),
      tremorsense: z.number().nonnegative(),
      truesight: z.number().nonnegative(),
      devilsSight: z.number().nonnegative(),
      seeInvisible: z.boolean(),
    })
    .partial()
    .optional(),
  /** A Dex save for half damage does nothing on a success and half on a failure (evasion). */
  evasion: z.boolean().optional(),
  /** Saves against spells that would leave these conditions have advantage (inured to madness). */
  saveAdvantageVs: z.array(z.string()).optional(),
  /** Momentum dice each spent point gives while it lasts (the hunt: 2). */
  momentumPerPoint: count.optional(),
  /** Darkvision this many feet longer, or this far with none (piercing gaze). */
  darkvisionPlus: z.number().positive().optional(),
  /**
   * A bleeding wound: at the end of each of the bearer's turns it loses `dice`
   * of `die` hit points, a die fewer each time, then makes a Constitution save
   * against `dc` + half the dice left to stop it (hemorrhaging wound).
   */
  bleed: z.object({ dice: count, die: count, dc: z.number().int() }).optional(),
  /** Feet of speed more in light armor or none (unencumbered movement). */
  lightSpeed: z.number().int().positive().optional(),
  /** In medium armor, AC counts Constitution (to +2) instead of Dexterity when higher (marauder momentum). */
  mediumArmorCon: z.boolean().optional(),
  /** Two-handed melee weapon hits deal half the Strength modifier (rounded up) more (titanic strength). */
  twoHandedStrength: z.boolean().optional(),
  /** Attacks per Attack action, at least (blood frenzy: three). */
  actionAttacks: count.optional(),
};

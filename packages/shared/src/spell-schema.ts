import { z } from 'zod';
import { ABILITIES, DamageSchema, DamageTypeSchema } from './stats-schema.ts';

// Spells, class features and the effects they leave on creatures. Spells and
// classes are data in packages/shared/content; the engine in spells.ts,
// effects.ts and features.ts runs them.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');
const dice = z.string().min(1);

export const AbilitySchema = z.enum(ABILITIES);

export const ConditionSchema = z.enum([
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
]);
export type Condition = z.infer<typeof ConditionSchema>;

/** What an effect changes about the creature that has it. */
const modifiers = {
  conditions: z.array(ConditionSchema).optional(),
  /** Added to the bearer's attack rolls, e.g. "1d4" for bless or "-1d4" for bane. */
  attackBonus: dice.optional(),
  /** Added to the bearer's saving throws. */
  saveBonus: dice.optional(),
  ac: z.number().int().optional(),
  /** Feet added to (or taken from) the bearer's speed. */
  speed: z.number().int().optional(),
  resistances: z.array(DamageTypeSchema).optional(),
  /** Attacks against the bearer have advantage (faerie fire) or disadvantage. */
  advantageAgainst: z.boolean().optional(),
  disadvantageAgainst: z.boolean().optional(),
  /** The bearer's own attacks have advantage or disadvantage. */
  advantage: z.boolean().optional(),
  disadvantage: z.boolean().optional(),
  /** Extra damage on the bearer's melee weapon attacks (rage). */
  meleeDamage: z.number().int().optional(),
  /** Saving throws the bearer makes with advantage. */
  saveAdvantage: z.array(AbilitySchema).optional(),
};

/** An effect as a spell or feature describes it, before it lands on anyone. */
export const EffectTemplateSchema = z.object({
  /** Shown on the token; defaults to the spell or feature name. */
  name: z.string().optional(),
  ...modifiers,
  /** How long it lasts in rounds; missing means until removed or the spell ends. */
  rounds: z.number().int().positive().optional(),
  /** Ends the first time it changes an attack roll (guiding bolt, vicious mockery). */
  once: z.boolean().optional(),
  /** The bearer repeats the save at the end of each of its turns and shakes it off on a success. */
  repeatSave: z.boolean().optional(),
  /** Ends when the bearer attacks or casts a spell (invisibility). */
  endsOnAttack: z.boolean().optional(),
});
export type EffectTemplate = z.infer<typeof EffectTemplateSchema>;

/** An effect on a token. Written to the token file, so it survives restarts and can be edited. */
export const EffectSchema = EffectTemplateSchema.extend({
  id,
  name: z.string().min(1),
  /** The token whose spell or feature made it; its rounds count down on that token's turns. */
  source: z.string().optional(),
  /** Ends when the source stops concentrating. */
  concentration: z.boolean().optional(),
  /** For `repeatSave`: the ability and DC to save against. */
  save: z.object({ ability: AbilitySchema, dc: z.number().int() }).optional(),
  /** Only attacks by this token get `advantageAgainst` (vex). */
  onlyFor: z.string().optional(),
});
export type Effect = z.infer<typeof EffectSchema>;

export const AreaSchema = z.object({
  /** sphere: radius around a point; emanation: radius around the caster; cone, line and cube start at the caster. */
  shape: z.enum(['sphere', 'emanation', 'cone', 'cube', 'line']),
  /** Feet: radius, cone length, cube side or line length. */
  size: z.number().positive(),
  /** Width of a line in feet. */
  width: z.number().positive().default(5),
});
export type Area = z.infer<typeof AreaSchema>;

export const SummonSchema = z.object({
  /** What the caster may pick from: a monster id and how many of it appear. */
  options: z.array(z.object({ monster: id, count: z.number().int().positive().default(1) })).min(1),
  /** "own": the summons get their own turn after the caster's; "shared": they act on the caster's turn. */
  turn: z.enum(['own', 'shared']).default('shared'),
});
export type Summon = z.infer<typeof SummonSchema>;

export const CastingTimeSchema = z.enum(['action', 'bonus', 'reaction', 'minute', 'hour']);
export type CastingTime = z.infer<typeof CastingTimeSchema>;

export const SpellSchema = z.object({
  id,
  name: z.string().min(1),
  /** 0 for cantrips. */
  level: z.number().int().min(0).max(9),
  school: z.string(),
  classes: z.array(id).default([]),
  castingTime: CastingTimeSchema,
  /** Range in feet: 0 for self, 5 for touch. */
  range: z.number().nonnegative(),
  ritual: z.boolean().default(false),
  concentration: z.boolean().default(false),
  /** Duration in rounds; missing for instantaneous spells. */
  rounds: z.number().int().positive().optional(),
  /** Duration as the rules write it, e.g. "1 minute". */
  duration: z.string().default('Instantaneous'),
  /** How many creatures it targets; areas hit everyone inside instead. */
  targets: z.number().int().nonnegative().default(1),
  area: AreaSchema.optional(),
  /** A spell attack roll against each target. */
  attack: z.enum(['melee', 'ranged']).optional(),
  save: z.object({ ability: AbilitySchema, onSave: z.enum(['half', 'none']).default('none') }).optional(),
  damage: z.array(DamageSchema).default([]),
  /** Hit points restored, plus the caster's spellcasting modifier when `healMod`. */
  heal: dice.optional(),
  healMod: z.boolean().default(false),
  /** Separate attacks or bolts per cast (magic missile darts, scorching rays, eldritch blast beams). */
  beams: z.number().int().positive().optional(),
  /** Never misses (magic missile). */
  autoHit: z.boolean().default(false),
  /** Changes when cast with a higher slot, per level above the spell's. */
  upcast: z
    .object({
      damage: dice.optional(),
      heal: dice.optional(),
      targets: z.number().int().optional(),
      beams: z.number().int().optional(),
    })
    .optional(),
  /** Cantrips grow at character levels 5, 11 and 17: more dice, or more beams. */
  cantrip: z.enum(['dice', 'beams']).optional(),
  /** Left on each creature hit, or failing its save. */
  effect: EffectTemplateSchema.optional(),
  summon: SummonSchema.optional(),
  /** Moves the caster up to this many feet to a point they can see (misty step). */
  teleport: z.number().positive().optional(),
  /** Only creatures of these types are affected (hold person: humanoid). */
  creatureTypes: z.array(z.string()).optional(),
  /** false when the engine only shows the text: the GM applies it by hand. */
  automated: z.boolean().default(true),
  description: z.string().default(''),
});
export type Spell = z.infer<typeof SpellSchema>;

/** A number that grows with class level: [[1, 2], [3, 3]] means 2 from level 1, 3 from level 3. */
export const LevelTableSchema = z.array(z.tuple([z.number().int().min(1).max(20), z.number().int()]));
export type LevelTable = z.infer<typeof LevelTableSchema>;

export const FeatureSchema = z.object({
  id,
  name: z.string().min(1),
  level: z.number().int().min(1).max(20),
  description: z.string().default(''),
  /** Uses before a rest; missing for features you can always use. */
  uses: LevelTableSchema.optional(),
  /** "short-one": a short rest gives one use back, a long rest all of them. */
  recharge: z.enum(['short', 'short-one', 'long']).default('long'),
  /** What using it costs on your turn. Passive features have none. */
  action: z.enum(['action', 'bonus', 'free']).optional(),
  /** Hit points regained on use; "level" stands for the class level, e.g. "1d10+level". */
  heal: z.string().optional(),
  /** Gives back your action (action surge). */
  grantAction: z.boolean().optional(),
  /** An effect put on yourself on use (rage). */
  effect: EffectTemplateSchema.optional(),
  /** For an effect's `meleeDamage`: the bonus by class level. */
  meleeDamage: LevelTableSchema.optional(),
});
export type Feature = z.infer<typeof FeatureSchema>;

export const SpellcastingSchema = z.object({
  ability: AbilitySchema,
  /** Slot progression: full casters, half casters (paladin, ranger) or a warlock's pact magic. */
  progression: z.enum(['full', 'half', 'pact']),
});
export type Spellcasting = z.infer<typeof SpellcastingSchema>;

export const ClassSchema = z.object({
  id,
  name: z.string().min(1),
  /** e.g. 10 for a d10. */
  hitDie: z.number().int().positive(),
  saves: z.array(AbilitySchema),
  spellcasting: SpellcastingSchema.optional(),
  /** Attacks per Attack action by level (extra attack). */
  attacks: LevelTableSchema.optional(),
  /** Sneak attack: ceil(level / 2) d6 once a turn. */
  sneakAttack: z.boolean().optional(),
  /** 2024 weapon mastery: your weapons' mastery properties apply. */
  weaponMastery: z.boolean().optional(),
  features: z.array(FeatureSchema).default([]),
});
export type Class = z.infer<typeof ClassSchema>;

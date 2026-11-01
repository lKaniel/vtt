import { z } from 'zod';
import { ABILITIES, DamageSchema, DamageTypeSchema } from './stats-schema.ts';

// Spells, class features and the effects they leave on creatures. Spells and
// classes are data in packages/system-dnd5e/content; the engine in spells.ts,
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

/** Extra damage an effect adds to hits; "weapon" takes the type of the attack it rides on. */
export const RiderDamageSchema = z.object({ dice, type: z.union([DamageTypeSchema, z.literal('weapon')]) });
export type RiderDamage = z.infer<typeof RiderDamageSchema>;

/** What an effect changes about the creature that has it. */
const modifiers = {
  conditions: z.array(ConditionSchema).optional(),
  /** Added to the bearer's attack rolls, e.g. "1d4" for bless or "-1d4" for bane. */
  attackBonus: dice.optional(),
  /** Added to the bearer's saving throws. */
  saveBonus: dice.optional(),
  ac: z.number().int().optional(),
  /** Unarmored AC before dex: the bearer's AC without body armor is this + dex (mage armor). */
  armorBase: z.number().int().optional(),
  /** The bearer's AC is at least this (barkskin). */
  minAc: z.number().int().optional(),
  /** Added to the bearer's hit point maximum (aid). */
  maxHp: z.number().int().optional(),
  /** Temporary hit points the bearer gains at the start of each of its turns; "mod" is the caster's spellcasting modifier (heroism). */
  turnTempHp: z.union([z.number().int(), z.literal('mod')]).optional(),
  /** Feet added to (or taken from) the bearer's speed. */
  speed: z.number().int().optional(),
  /** The bearer's speed is multiplied by this after the rest: 2 for haste, 0.5 for slow. */
  speedTimes: z.number().positive().optional(),
  /** Attacks the bearer gets at the start of each of its turns, on top of its action (haste). */
  turnAttacks: z.number().int().positive().optional(),
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
  /** Damage the bearer adds to its weapon hits (divine favor; with `once`, a smite). */
  hitDamage: z.array(RiderDamageSchema).optional(),
  /** Damage `onlyFor` adds when it hits the bearer with an attack (hunter's mark, hex). */
  markDamage: z.array(RiderDamageSchema).optional(),
  /** Added to the bearer's weapon attack and damage rolls (magic weapon). */
  weaponBonus: z.number().int().optional(),
  /** The bearer keeps a spell's area going: creatures that start their turn in it or walk into it are hit (spirit guardians). */
  zone: z
    .object({
      spell: id,
      slot: z.number().int().min(0).max(9),
      /** Where a placed area sits; missing for areas around the bearer. */
      at: z.tuple([z.number(), z.number()]).optional(),
      /** "allies": creatures on the bearer's side aren't hit. */
      spares: z.enum(['allies']).optional(),
    })
    .optional(),
  /** The bearer may use this spell again without a slot while it lasts (spiritual weapon, call lightning). */
  repeat: z.object({ spell: id, slot: z.number().int().min(0).max(9) }).optional(),
  /** The bearer's movement doesn't provoke opportunity attacks (disengage). */
  disengaged: z.boolean().optional(),
  /** The bearer's speed is 0 (hypnotic pattern). */
  immobile: z.boolean().optional(),
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
  /** With `repeatSave`: failing the repeated save swaps the conditions for these and ends the saves (2024 sleep). */
  worsens: z.array(ConditionSchema).optional(),
  /** Ends when the bearer takes damage (sleep, hypnotic pattern). */
  endsOnDamage: z.boolean().optional(),
  /** The bearer repeats the save, with advantage, each time it takes damage (hideous laughter). */
  saveOnDamage: z.boolean().optional(),
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
  /** Temporary hit points given to each target (false life); they don't stack with others. */
  tempHp: dice.optional(),
  /** Hit points of creatures affected, weakest first, rolled on each cast (2014 sleep). */
  hpPool: dice.optional(),
  /** Ends the target's effects that impose any of these conditions (lesser restoration). */
  cures: z.array(ConditionSchema).optional(),
  /** Brings a dead creature back with 1 hit point (revivify). */
  revive: z.boolean().optional(),
  /** Makes a dying creature stable (spare the dying). */
  stabilize: z.boolean().optional(),
  /** The caster regains half the damage dealt (vampiric touch). */
  drain: z.boolean().optional(),
  /** What the GM still has to do by hand when the rest is automated; shown in the log. */
  gmNote: z.string().optional(),
  /** Separate attacks or bolts per cast (magic missile darts, scorching rays, eldritch blast beams). */
  beams: z.number().int().positive().optional(),
  /** Never misses (magic missile). */
  autoHit: z.boolean().default(false),
  /** Changes when cast with a higher slot, per level above the spell's. */
  upcast: z
    .object({
      damage: dice.optional(),
      heal: dice.optional(),
      tempHp: z.number().int().optional(),
      /** Added to the effect's `maxHp`, and healed on casting (aid). */
      maxHp: z.number().int().optional(),
      hpPool: dice.optional(),
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
  /** Feet each creature hit (or failing its save) is moved: positive pushes away from the caster, negative pulls closer. */
  push: z.number().int().optional(),
  /**
   * The damage isn't dealt on casting but rides on later hits: "self" on the
   * caster's weapon hits (divine favor, smites), "mark" on the caster's attacks
   * against the target (hunter's mark, hex).
   */
  rider: z.enum(['self', 'mark']).optional(),
  /** Rider damage takes the type of the weapon it rides on (2014 hunter's mark). */
  weaponType: z.boolean().optional(),
  /** The area stays: it hits creatures that start their turn in it or enter it (spirit guardians, moonbeam). */
  zone: z
    .object({
      spares: z.enum(['allies']).optional(),
      /** Whether it also hits what's in it when cast. */
      onCast: z.boolean().default(true),
    })
    .optional(),
  /** Later turns can use it again without a slot, with this action (spiritual weapon, call lightning). */
  repeat: z.enum(['action', 'bonus']).optional(),
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
  /** Extra attacks it gives this turn (flurry of blows, a monk's bonus unarmed strike). */
  grantAttacks: z.number().int().positive().optional(),
  /** For a `passive` effect's `speed`: the bonus by class level (unarmored movement). */
  speed: LevelTableSchema.optional(),
  /** Using it gives the creature its speed again as movement (Dash). */
  dash: z.boolean().optional(),
  /** Basic actions (by id) this feature lets the creature take as a bonus action (cunning action). */
  bonusActions: z.array(id).optional(),
  /** An effect the creature always has (danger sense). */
  passive: EffectTemplateSchema.optional(),
  /** Unarmored, AC is 10 + Dex + this ability (unarmored defense). */
  unarmoredAc: AbilitySchema.optional(),
  /** false when a shield loses unarmored defense (monk). */
  unarmoredShield: z.boolean().optional(),
  /** Uses are this ability's modifier, at least 1 (bardic inspiration). */
  usesAbility: AbilitySchema.optional(),
  /** Uses are class level times this, spent a hit point at a time (lay on hands). */
  poolPerLevel: z.number().int().positive().optional(),
  /** Spends the uses of this other feature (turn undead uses channel divinity). */
  usesFrom: id.optional(),
  /** From this class level a short rest gives every use back (font of inspiration). */
  shortRestFrom: z.number().int().min(1).max(20).optional(),
  /** The die size by class level; "{die}" in `spell` stands for it, e.g. "1d{die}". */
  die: LevelTableSchema.optional(),
  /** Heals a target from the pool of uses, as much as it's missing (lay on hands). */
  healPool: z.boolean().optional(),
  /** Aimed like a spell at creatures or an area: spell fields such as targets, range, area, save, effect. */
  spell: z.record(z.string(), z.unknown()).optional(),
});
export type Feature = z.infer<typeof FeatureSchema>;

export const SpellcastingSchema = z.object({
  ability: AbilitySchema,
  /** Slot progression: full casters, half casters (paladin, ranger) or a warlock's pact magic. */
  progression: z.enum(['full', 'half', 'pact']),
  /** Class level spellcasting starts at (2 for 2014 paladins and rangers). */
  from: z.number().int().min(1).default(1),
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

import { z } from 'zod';

// Creature statistics and the SRD content they're built from. Monsters and
// items live as JSON in packages/system-dnd5e/content; tokens refer to them by id.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');

/** Which rules a world or character follows: 2014 (SRD 5.1) or 2024 (SRD 5.2). */
export const EditionSchema = z.enum(['2014', '2024']);
export type Edition = z.infer<typeof EditionSchema>;

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

const score = z.number().int().min(1).max(30).default(10);
export const AbilitiesSchema = z.object({ str: score, dex: score, con: score, int: score, wis: score, cha: score });
export type Abilities = z.infer<typeof AbilitiesSchema>;

export const DamageTypeSchema = z.enum([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);
export type DamageType = z.infer<typeof DamageTypeSchema>;

/** One damage roll of an attack, e.g. { "dice": "1d8+3", "type": "piercing" }. */
export const DamageSchema = z.object({ dice: z.string().min(1), type: DamageTypeSchema });
export type Damage = z.infer<typeof DamageSchema>;

/** Normal and long range in feet. */
const RangeSchema = z.tuple([z.number().positive(), z.number().positive()]);

export const WeaponPropertySchema = z.enum([
  'ammunition',
  'finesse',
  'heavy',
  'light',
  'loading',
  'reach',
  'thrown',
  'two-handed',
  'versatile',
]);

/** A ready-to-roll attack, as printed in a stat block. */
export const AttackSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['melee', 'ranged']),
  toHit: z.number().int(),
  /** Melee reach in feet. */
  reach: z.number().positive().optional(),
  range: RangeSchema.optional(),
  damage: z.array(DamageSchema).min(1),
  /** Set on attacks made with a weapon: the ability it used, its properties and mastery. */
  weapon: z
    .object({
      ability: z.enum(ABILITIES),
      properties: z.array(WeaponPropertySchema).default([]),
      mastery: z.string().optional(),
    })
    .optional(),
  /** The bonus attack of two-weapon fighting: no ability modifier to damage. */
  offHand: z.boolean().optional(),
});
export type Attack = z.infer<typeof AttackSchema>;

const defenses = {
  resistances: z.array(DamageTypeSchema).default([]),
  immunities: z.array(DamageTypeSchema).default([]),
  vulnerabilities: z.array(DamageTypeSchema).default([]),
};

const itemBase = {
  id,
  name: z.string().min(1),
  weight: z.number().nonnegative().default(0),
  /** A magic item that only works for a creature attuned to it (three at most). */
  attunement: z.boolean().optional(),
  /** What it adds while equipped (and attuned, if it needs that): a ring of protection's +1. */
  bonus: z.object({ ac: z.number().int().optional(), saves: z.number().int().optional() }).optional(),
};

export const ItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('weapon'),
    ...itemBase,
    category: z.enum(['simple', 'martial']),
    kind: z.enum(['melee', 'ranged']),
    damage: DamageSchema,
    properties: z.array(WeaponPropertySchema).default([]),
    range: RangeSchema.optional(),
    versatile: z.string().optional(),
    mastery: z.string().optional(),
  }),
  z.object({
    type: z.literal('armor'),
    ...itemBase,
    category: z.enum(['light', 'medium', 'heavy', 'shield']),
    /** Base AC, or the bonus for a shield. */
    ac: z.number().int(),
    strength: z.number().int().optional(),
    stealthDisadvantage: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('gear'),
    ...itemBase,
    description: z.string().optional(),
    /** Holds other gear: `capacity` in pounds; a bag of holding's contents weigh nothing. */
    container: z.object({ capacity: z.number().positive(), weightless: z.boolean().optional() }).optional(),
    /** What using it does; items without it can't be used from the action bar. */
    use: z
      .object({
        /** Hit points regained, e.g. "2d4+2". */
        heal: z.string().optional(),
        /** A potion: drinking it is an action in 2014 and a bonus action in 2024. */
        potion: z.boolean().default(false),
      })
      .optional(),
  }),
]);
export type Item = z.infer<typeof ItemSchema>;
export type Weapon = Extract<Item, { type: 'weapon' }>;
export type Armor = Extract<Item, { type: 'armor' }>;

/** Legendary actions: how many per round, and what they can be spent on. */
export const LegendarySchema = z.object({
  actions: z.number().int().positive(),
  options: z.array(
    z.object({
      id,
      name: z.string().min(1),
      cost: z.number().int().min(1).max(3).default(1),
      /** The name of the attack it makes (a dragon's tail attack); without one it is described in chat. */
      attack: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
});
export type Legendary = z.infer<typeof LegendarySchema>;

/** Lair actions, one taken on initiative count 20 each round (losing ties). */
export const LairSchema = z.object({
  actions: z.array(z.object({ id, name: z.string().min(1), description: z.string().optional() })).min(1),
});
export type Lair = z.infer<typeof LairSchema>;

const legendaryParts = {
  legendary: LegendarySchema.optional(),
  /** Failed saves it may turn into successes, per day. */
  legendaryResistance: z.number().int().positive().optional(),
  lair: LairSchema.optional(),
};

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
  ...defenses,
  conditionImmunities: z.array(z.string()).default([]),
  ...legendaryParts,
  /** Painted top-down token with a transparent background, set from content/token-art.json. */
  img: z.string().optional(),
});
export type Monster = z.infer<typeof MonsterSchema>;

/** Levels in one class of a multiclassed character. */
export const ClassLevelSchema = z.object({
  class: z.string().min(1),
  level: z.number().int().min(1).max(20),
  subclass: z.string().optional(),
});
export type ClassLevelEntry = z.infer<typeof ClassLevelSchema>;

/** Stats written on a token. Each one overrides the monster's or the computed value. */
export const StatsSchema = z.object({
  /** Follow the other edition's rules than the world, e.g. a 2024 class in a 2014 game. */
  rules: EditionSchema.optional(),
  level: z.number().int().min(1).max(20).optional(),
  /** Experience points earned. */
  xp: z.number().int().min(0).optional(),
  class: z.string().optional(),
  /** A multiclassed character's classes, the first one taken at 1st level; instead of `class` and `level`. */
  classes: z.array(ClassLevelSchema).min(1).optional(),
  abilities: AbilitiesSchema.partial().optional(),
  ac: z.number().int().optional(),
  maxHp: z.number().int().positive().optional(),
  proficiency: z.number().int().optional(),
  /** Extra attacks besides the equipped weapons. */
  attacks: z.array(AttackSchema).optional(),
  /** Spells the character knows or has prepared, by id. */
  spells: z.array(id).optional(),
  /** Class features granted on top of the class's own, as "<class>/<feature>" (e.g. "barbarian/rage"). */
  features: z.array(z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/, 'use "<class>/<feature>"')).optional(),
  /** Skills the character is proficient in, e.g. "stealth". */
  skills: z.array(id).optional(),
  /** Spellcasting for creatures without a caster class (a homebrew class, a monster). */
  spellcasting: z
    .object({
      ability: z.enum(ABILITIES),
      progression: z.enum(['full', 'half', 'third', 'pact']).default('full'),
      /** Caster level for slots and cantrips; defaults to `level`. */
      level: z.number().int().min(1).max(20).optional(),
    })
    .optional(),
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  vulnerabilities: z.array(DamageTypeSchema).optional(),
  /** Legendary actions, resistance and a lair for any creature (a boss NPC), or overriding the monster's. */
  ...legendaryParts,
});
export type Stats = z.infer<typeof StatsSchema>;

export const InventoryEntrySchema = z.object({
  /** Names the entry when other entries are inside it (a backpack). */
  id: id.optional(),
  item: id,
  /** The id of the container entry it is carried in. */
  in: id.optional(),
  /** Attuned to this magic item (see `attunement` on the item). */
  attuned: z.boolean().optional(),
  /** For a spell scroll: the spell written on it. */
  spell: id.optional(),
  equipped: z.boolean().default(false),
  qty: z.number().int().positive().default(1),
});
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

/** At most this many attuned magic items. */
export const MAX_ATTUNED = 3;

/** What a creature carries; no more than three attuned items. */
export const InventorySchema = z
  .array(InventoryEntrySchema)
  .refine((list) => list.filter((e) => e.attuned).length <= MAX_ATTUNED, `at most ${MAX_ATTUNED} attuned items`);

const coins = z.number().int().nonnegative().optional();
/** Coins carried, by kind. */
export const CurrencySchema = z.object({ cp: coins, sp: coins, ep: coins, gp: coins, pp: coins });
export type Currency = z.infer<typeof CurrencySchema>;
export const COINS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;
export type Coin = (typeof COINS)[number];

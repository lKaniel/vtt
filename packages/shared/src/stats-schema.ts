import { z } from 'zod';

// Creature statistics and the SRD content they're built from. Monsters and
// items live as JSON in packages/shared/content; tokens refer to them by id.

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

/** A ready-to-roll attack, as printed in a stat block. */
export const AttackSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['melee', 'ranged']),
  toHit: z.number().int(),
  /** Melee reach in feet. */
  reach: z.number().positive().optional(),
  range: RangeSchema.optional(),
  damage: z.array(DamageSchema).min(1),
});
export type Attack = z.infer<typeof AttackSchema>;

const defenses = {
  resistances: z.array(DamageTypeSchema).default([]),
  immunities: z.array(DamageTypeSchema).default([]),
  vulnerabilities: z.array(DamageTypeSchema).default([]),
};

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

const itemBase = { id, name: z.string().min(1), weight: z.number().nonnegative().default(0) };

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
  z.object({ type: z.literal('gear'), ...itemBase, description: z.string().optional() }),
]);
export type Item = z.infer<typeof ItemSchema>;
export type Weapon = Extract<Item, { type: 'weapon' }>;
export type Armor = Extract<Item, { type: 'armor' }>;

export const MonsterSchema = z.object({
  id,
  name: z.string().min(1),
  /** Squares per side: 1 for small and medium, 2 for large. */
  size: z.number().positive().default(1),
  ac: z.number().int(),
  hp: z.number().int().positive(),
  speed: z.number().nonnegative().default(30),
  darkvision: z.number().nonnegative().default(0),
  abilities: AbilitiesSchema,
  /** Challenge rating, e.g. 0.25 for CR 1/4. */
  cr: z.number().nonnegative(),
  attacks: z.array(AttackSchema).default([]),
  ...defenses,
});
export type Monster = z.infer<typeof MonsterSchema>;

/** Stats written on a token. Each one overrides the monster's or the computed value. */
export const StatsSchema = z.object({
  /** Follow the other edition's rules than the world, e.g. a 2024 class in a 2014 game. */
  rules: EditionSchema.optional(),
  level: z.number().int().min(1).max(20).optional(),
  class: z.string().optional(),
  abilities: AbilitiesSchema.partial().optional(),
  ac: z.number().int().optional(),
  maxHp: z.number().int().positive().optional(),
  proficiency: z.number().int().optional(),
  /** Extra attacks besides the equipped weapons. */
  attacks: z.array(AttackSchema).optional(),
  resistances: z.array(DamageTypeSchema).optional(),
  immunities: z.array(DamageTypeSchema).optional(),
  vulnerabilities: z.array(DamageTypeSchema).optional(),
});
export type Stats = z.infer<typeof StatsSchema>;

export const InventoryEntrySchema = z.object({
  item: id,
  equipped: z.boolean().default(false),
  qty: z.number().int().positive().default(1),
});
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

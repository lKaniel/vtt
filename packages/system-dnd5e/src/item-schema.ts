import { LightSchema } from '@vtt/shared';
import { z } from 'zod';
import { AbilitySchema, EffectTemplateSchema } from './spell-schema.ts';
import { DamageSchema, RangeSchema, WeaponPropertySchema, WeaponRiderSchema } from './stats-schema.ts';

// Weapons, armor and gear, mundane and magic. The SRD's are generated into
// content/srd/items-5.x.json (import-srd) with hand automation from
// content/srd/item-automation.json merged in; worlds and characters add
// their own.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');

export const RaritySchema = z.enum(['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact']);
export type Rarity = z.infer<typeof RaritySchema>;

/**
 * A spell a magic item casts: `cost` charges ("level": as many as the slot's
 * level, less `less`, so a wand of fireballs casts a 3rd-level fireball for
 * 1), at a fixed `level` or upcast with more charges, or once a day.
 */
export const ItemCastSchema = z.object({
  spell: id,
  cost: z.union([z.number().int().nonnegative(), z.literal('level')]).optional(),
  less: z.number().int().nonnegative().optional(),
  level: z.number().int().min(0).max(9).optional(),
  daily: z.boolean().optional(),
});
export type ItemCast = z.infer<typeof ItemCastSchema>;

const itemBase = {
  id,
  name: z.string().min(1),
  weight: z.number().nonnegative().default(0),
  /** What it costs in a shop, in gold pieces (0.1 is a silver piece); magic items have none. */
  price: z.number().nonnegative().optional(),
  description: z.string().optional(),
  /** What sort of thing it is, for the compendium: potion, ring, wand, tool, ammunition... */
  group: z.string().optional(),
  rarity: RaritySchema.optional(),
  /** A magic item: its hits count as magical. */
  magic: z.boolean().optional(),
  /** A magic item that only works for a creature attuned to it (three at most). */
  attunement: z.boolean().optional(),
  /** Only these classes may attune to it (a holy avenger: paladins). */
  attunedBy: z.array(id).optional(),
  /** What it adds while equipped (and attuned, if it needs that): a ring of protection's +1, a wand of the war mage's spell attacks. */
  bonus: z
    .object({
      ac: z.number().int().optional(),
      saves: z.number().int().optional(),
      spellAttack: z.number().int().optional(),
      spellDc: z.number().int().optional(),
    })
    .optional(),
  /** What it does to its bearer while equipped (and attuned, if it needs that): a belt's Strength, boots' speed, a ring's resistance. */
  effect: EffectTemplateSchema.optional(),
  /** Spells it casts while it works (equipped, attuned if it needs that). */
  casts: z.array(ItemCastSchema).optional(),
  /** Charges it holds, and the dice it regains each dawn (on a long rest). */
  charges: z.object({ max: z.number().int().positive(), recharge: z.string().optional() }).optional(),
  /** Its spells' save DC and attack bonus, when it has its own (a wand of fireballs: DC 15); else the wielder's. */
  dc: z.number().int().optional(),
  attack: z.number().int().optional(),
  /** The part the GM still runs by hand, shown with the item. */
  gmNote: z.string().optional(),
  /** Why the GM runs the whole item by hand: `utility` (no numbers to run), `gm` (the story decides). */
  manual: z.object({ kind: z.enum(['utility', 'gm']), why: z.string().min(1) }).optional(),
};

/** What using a piece of gear does; gear without it can't be used from the action bar. */
export const GearUseSchema = z.object({
  /** Hit points regained, e.g. "2d4+2". */
  heal: z.string().optional(),
  /** Temporary hit points gained, e.g. 10 or "2d4". */
  tempHp: z.union([z.number().int().positive(), z.string()]).optional(),
  /** A potion: drinking it is an action in 2014 and a bonus action in 2024. */
  potion: z.boolean().default(false),
  /** An effect the user gets, for `rounds` (600 is an hour): a potion of giant strength, of flying. */
  effect: EffectTemplateSchema.optional(),
  /** Raises an ability score for good, and its maximum with it (a manual of bodily health). */
  raise: z.object({ ability: AbilitySchema, by: z.number().int().positive() }).optional(),
  /** Lighting it: the bearer sheds this light for `lasts` seconds (a torch, a lantern). */
  light: LightSchema.optional(),
  /** What lighting it burns instead of the item itself (a lantern burns a flask of oil). */
  fuel: z.string().optional(),
});
export type GearUse = z.infer<typeof GearUseSchema>;

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
    /** A +1, +2 or +3 weapon: added to its attack and damage rolls. */
    plus: z.number().int().optional(),
    /** Extra damage on each hit with it (flame tongue, dragon slayer). */
    hitDamage: z.array(WeaponRiderSchema).optional(),
    /** The weapon it is made from (a longsword for a flame tongue longsword). */
    base: id.optional(),
  }),
  z.object({
    type: z.literal('armor'),
    ...itemBase,
    category: z.enum(['light', 'medium', 'heavy', 'shield']),
    /** Base AC, or the bonus for a shield; a +1 armor's bonus is counted in. */
    ac: z.number().int(),
    strength: z.number().int().optional(),
    stealthDisadvantage: z.boolean().default(false),
    /** The armor it is made from (plate for a plate armor +1). */
    base: id.optional(),
  }),
  z.object({
    type: z.literal('gear'),
    ...itemBase,
    /** Holds other gear: `capacity` in pounds; a bag of holding's contents weigh nothing. */
    container: z.object({ capacity: z.number().positive(), weightless: z.boolean().optional() }).optional(),
    /** Magic ammunition: added to the attack and damage of the ranged weapon that fires it. */
    plus: z.number().int().optional(),
    use: GearUseSchema.optional(),
  }),
]);
export type Item = z.infer<typeof ItemSchema>;
export type Weapon = Extract<Item, { type: 'weapon' }>;
export type Armor = Extract<Item, { type: 'armor' }>;
export type GearItem = Extract<Item, { type: 'gear' }>;

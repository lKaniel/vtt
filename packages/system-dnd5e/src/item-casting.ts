import { type Rng, roll } from '@vtt/shared';
import { itemWorks } from './carrying.ts';
import type { CasterSheet } from './classes.ts';
import type { Content } from './content.ts';
import type { Creature } from './creature.ts';
import type { Item, ItemCast } from './item-schema.ts';
import { scrollCaster } from './sheet-drops.ts';
import type { Spell } from './spell-schema.ts';
import type { InventoryEntry } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// Wands, staffs, rings and the rest that cast spells: each spell costs
// charges (or is free, or once a day), uses the item's own save DC when it
// has one, and the item regains charges at dawn (on a long rest).

/** A spell a creature can cast from the item at inventory `index`, with the charges it has `left`. */
export interface ItemSpell extends ItemCast {
  index: number;
  item: string;
  left?: number;
  max?: number;
}

/** Which item, which of its spells and at what slot level. */
export interface ItemCastPick {
  index: number;
  spell: string;
  slot: number;
}

const ORDINAL = ['cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

function left(entry: InventoryEntry, item: Item): number | undefined {
  return item.charges ? Math.max(0, item.charges.max - (entry.spent ?? 0)) : undefined;
}

/** Every spell the token's working items cast. */
export function itemCasts(token: Token, content: Content): ItemSpell[] {
  return (token.inventory ?? []).flatMap((entry, index) => {
    const item = content.items.get(entry.item);
    if (!item?.casts || !itemWorks(entry, item)) return [];
    const charges = item.charges ? { left: left(entry, item), max: item.charges.max } : {};
    return item.casts.map((c) => ({ index, item: item.id, ...c, ...charges }));
  });
}

/** The charges `cast` costs at `slot`, for a spell of `level`. */
export function castCharges(cast: ItemCast, slot: number): number {
  if (cast.daily) return 0;
  if (cast.cost === 'level') return Math.max(0, slot - (cast.less ?? 0));
  return cast.cost ?? 1;
}

/** The slot levels the cast may go at: fixed, or from the spell's level up (more charges). */
function slotProblem(cast: ItemCast, spell: Spell, slot: number): string | undefined {
  const fixed = cast.level ?? (cast.cost === 'level' ? undefined : spell.level);
  if (fixed !== undefined && slot !== fixed) return `casts ${spell.name} at ${ORDINAL[fixed]} level only`;
  const lowest = Math.max(spell.level, cast.less !== undefined ? cast.less + 1 : spell.level);
  if (slot < lowest) return `casts ${spell.name} at ${ORDINAL[lowest]} level or higher`;
  return undefined;
}

function found(token: Token, content: Content, pick: ItemCastPick) {
  const entry = token.inventory?.[pick.index];
  const item = entry && content.items.get(entry.item);
  const cast = item?.casts?.find((c) => c.spell === pick.spell);
  const spell = content.spells.get(pick.spell);
  return entry && item && cast && spell ? { entry, item, cast, spell } : undefined;
}

/** Why `token` can't cast the spell from that item, or undefined if it can. */
export function itemCastProblem(token: Token, content: Content, pick: ItemCastPick): string | undefined {
  const at = found(token, content, pick);
  if (!at) return "can't cast that from what it carries";
  const { entry, item, cast, spell } = at;
  if (!itemWorks(entry, item)) return `needs to ${item.attunement ? 'attune to' : 'hold'} the ${item.name}`;
  if (cast.daily && entry.usedToday?.includes(spell.id)) return `has used the ${item.name}'s ${spell.name} today`;
  const problem = slotProblem(cast, spell, pick.slot);
  if (problem) return problem;
  const cost = castCharges(cast, pick.slot);
  const have = left(entry, item);
  if (have !== undefined && cost > have) return `has only ${have} charges left in the ${item.name}`;
  return undefined;
}

/** The token after casting from the item: its charges spent, or the day's use marked. Check `itemCastProblem` first. */
export function spendItemCast(token: Token, content: Content, pick: ItemCastPick): Token {
  const { entry, cast } = found(token, content, pick)!;
  const cost = castCharges(cast, pick.slot);
  const next: InventoryEntry = cast.daily
    ? { ...entry, usedToday: [...(entry.usedToday ?? []), pick.spell] }
    : { ...entry, ...(cost > 0 && { spent: (entry.spent ?? 0) + cost }) };
  const inventory = token.inventory!.map((e, i) => (i === pick.index ? next : e));
  return { ...token, inventory };
}

/** The spellcasting the item's spell goes off with: its own DC and attack, else the wielder's, else a scroll's. */
export function itemCaster(sheet: Pick<Creature, 'caster'>, item: Item, spell: Spell): CasterSheet {
  const base = sheet.caster ? { ...sheet.caster, spells: [spell] } : scrollCaster(sheet, spell, 1);
  return {
    ...base,
    ...(item.dc !== undefined && { dc: item.dc }),
    ...(item.attack !== undefined && { attack: item.attack }),
  };
}

function recharged(entry: InventoryEntry, item: Item | undefined, rng: Rng): InventoryEntry {
  const { usedToday: _used, ...rest } = entry;
  const dice = item?.charges?.recharge;
  if (!entry.spent || !dice) return rest;
  const spent = entry.spent - Math.max(0, roll(dice, rng).total);
  const { spent: _spent, ...fresh } = rest;
  return spent > 0 ? { ...fresh, spent } : fresh;
}

/** A new day (a long rest): items regain their dice of charges and their daily spells. */
export function rechargeItems(token: Token, content: Content, rng: Rng = Math.random): Token {
  if (!token.inventory?.some((e) => e.spent !== undefined || e.usedToday !== undefined)) return token;
  return { ...token, inventory: token.inventory.map((e) => recharged(e, content.items.get(e.item), rng)) };
}

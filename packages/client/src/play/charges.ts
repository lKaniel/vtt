import { type InventoryEntry, omitKey, type Spell, type Token } from '@vtt/system-dnd5e';

// Everything a creature spends and gets back (spell slots, feature uses,
// legendary actions, a class's point pool, hit dice, an item's charges):
// which slot levels a spell can use, and turning what the sheet sets as
// left back into what the token has spent, the same way for all of them.

type Spent = Token['spent'];

export interface SlotChoice {
  level: number;
  left: number;
  total: number;
}

/** Each slot level from the spell's own up to the caster's highest, with how many are left. */
export function slotChoices(spell: Spell, caster: { slots: number[]; left: number[] }): SlotChoice[] {
  const top = Math.max(spell.level, caster.slots.findLastIndex((n) => n > 0) + 1);
  return Array.from({ length: top - spell.level + 1 }, (_, i) => {
    const level = spell.level + i;
    return { level, left: caster.left[level - 1] ?? 0, total: caster.slots[level - 1] ?? 0 };
  });
}

/** Charges left after clicking pip `k`: a full pip is spent along with those after it, an empty one is restored. */
export function pipLeft(k: number, left: number): number {
  return k < left ? k : k + 1;
}

/** Drops empty parts so a fully rested token has no `spent` at all. */
function tidy(spent: NonNullable<Spent>): Spent {
  const { slots, uses, pool, hitDice } = spent;
  const out = {
    ...(slots?.some((n) => n > 0) && { slots }),
    ...(uses && Object.keys(uses).length && { uses }),
    ...(pool && { pool }),
    ...(hitDice && { hitDice }),
  };
  return Object.keys(out).length ? out : undefined;
}

/** `spent` with `left` of the `total` slots of `level` still unspent. */
export function withSlotsLeft(spent: Spent, { level, left, total }: SlotChoice): Spent {
  const slots = [...(spent?.slots ?? [])];
  while (slots.length < level) slots.push(0);
  slots[level - 1] = Math.max(0, total - left);
  return tidy({ ...spent, slots });
}

/** `spent` with `left` of the feature's `max` uses still unspent. */
export function withUsesLeft(spent: Spent, { id, left, max }: { id: string; left: number; max: number }): Spent {
  const rest = omitKey({ ...spent?.uses }, id);
  return tidy({ ...spent, uses: left >= max ? rest : { ...rest, [id]: max - left } });
}

/** Which of the creature's resources: they are all set the same way, as so many left of a total. */
export type ResourceKey =
  | { kind: 'slot'; level: number }
  /** A feature's uses, legendary actions ("legendary") and resistance ("legendary-resistance"). */
  | { kind: 'use'; id: string }
  /** A class's point pool; `full` is its size before reserved points come off. */
  | { kind: 'pool'; full: number }
  | { kind: 'hitDice' }
  /** A magic item's charges, at its inventory index. */
  | { kind: 'charges'; index: number };

interface Spender {
  spent?: NonNullable<Spent>;
  inventory?: InventoryEntry[];
}

/** `left` of `total`, kept between none and all. */
export interface Amount {
  left: number;
  total: number;
}

const within = ({ left, total }: Amount) => Math.min(total, Math.max(0, left));

const withSpent = <T extends Spender>(d: T, spent: Spent): T => (spent ? { ...d, spent } : omitKey(d, 'spent'));

function withCount(spent: Spent, key: 'pool' | 'hitDice', n: number): Spent {
  return tidy({ ...spent, [key]: n > 0 ? n : undefined });
}

const withUsed = (e: InventoryEntry, used: number): InventoryEntry =>
  used > 0 ? { ...e, spent: used } : omitKey(e, 'spent');

function withCharges<T extends Spender>(d: T, index: number, used: number): T {
  const inventory = (d.inventory ?? []).map((e, i) => (i === index ? withUsed(e, used) : e));
  return { ...d, inventory };
}

/** The creature with `left` of the resource's `total` unspent. */
export function withResourceLeft<T extends Spender>(d: T, key: ResourceKey, amount: Amount): T {
  const left = within(amount);
  const { total } = amount;
  switch (key.kind) {
    case 'slot':
      return withSpent(d, withSlotsLeft(d.spent, { level: key.level, left, total }));
    case 'use':
      return withSpent(d, withUsesLeft(d.spent, { id: key.id, left, max: total }));
    case 'pool':
      return withSpent(d, withCount(d.spent, 'pool', key.full - left));
    case 'hitDice':
      return withSpent(d, withCount(d.spent, 'hitDice', total - left));
    case 'charges':
      return withCharges(d, key.index, total - left);
  }
}

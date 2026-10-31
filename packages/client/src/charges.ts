import { omitKey, type Spell, type Token } from '@vtt/shared';

// Spell slots and feature charges: which slot levels a spell can use, and
// turning clicks on the sheet's pips back into what the token has spent.

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
  const slots = spent.slots?.some((n) => n > 0) ? spent.slots : undefined;
  const uses = spent.uses && Object.keys(spent.uses).length ? spent.uses : undefined;
  if (!slots && !uses) return undefined;
  return { ...(slots && { slots }), ...(uses && { uses }) };
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

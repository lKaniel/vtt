import { type GridKind, isParty, type Rng } from '@vtt/shared';
import { tokenDistance } from './attack.ts';
import { rollCheck, type CheckRoll } from './checks.ts';
import type { Creature } from './creature.ts';
import { canAct, rollSave, type SaveRoll } from './effects.ts';
import { stoppedBy } from './spells.ts';
import type { Token } from './token-schema.ts';

// Counterspell: as a creature casts a spell, an enemy caster within 60 ft
// may use its reaction to stop it. 2014: a slot of the spell's level or
// higher stops it outright, a lower one needs a spellcasting check against
// 10 + the spell's level. 2024: the caster makes a Constitution save, and a
// spell that fails keeps its slot.

export const COUNTERSPELL = 'counterspell';
const RANGE = 60;

interface Side {
  token: Token;
  sheet: Creature;
}

/** The slot the counterer spends: the lowest that stops a `level` spell outright (2014), else the lowest it has. */
export function counterSlot(sheet: Pick<Creature, 'caster' | 'edition'>, level = 0): number | undefined {
  const left = sheet.caster?.left ?? [];
  const open = [3, 4, 5, 6, 7, 8, 9].filter((n) => (left[n - 1] ?? 0) > 0);
  const outright = sheet.edition === '2014' ? open.find((n) => n >= level) : undefined;
  return outright ?? open[0];
}

function mayCounter({ token, sheet }: Side, caster: Token, scale: { gridSize: number; grid?: GridKind }): boolean {
  const known = sheet.caster?.spells.find((s) => s.id === COUNTERSPELL);
  if (!known || token.id === caster.id || isParty(token) === isParty(caster)) return false;
  if (sheet.hp <= 0 || !canAct(sheet) || stoppedBy(sheet, known)) return false;
  return tokenDistance(token, caster, scale.gridSize, scale.grid) <= RANGE && counterSlot(sheet) !== undefined;
}

/** The enemies of `caster` who could counter its spell now. */
export function counterers({
  caster,
  others,
  reacted,
  ...scale
}: {
  caster: Side;
  others: readonly Side[];
  /** Creatures that already used their reaction this round. */
  reacted: readonly string[];
  gridSize: number;
  grid?: GridKind;
}): Side[] {
  return others.filter((o) => !reacted.includes(o.token.id) && mayCounter(o, caster.token, scale));
}

export interface CounterOutcome {
  countered: boolean;
  /** 2014: the counterer's check against a spell above its slot. */
  check?: CheckRoll & { dc: number };
  /** 2024: the caster's Constitution save. */
  save?: SaveRoll;
  /** 2024: the countered spell's slot isn't spent. */
  keepsSlot?: boolean;
}

/** Whether `by`'s counterspell with `slot` stops `of`'s spell cast at `level`. */
export function counterOutcome(
  { by, of, slot, level }: { by: Side; of: Side; slot: number; level: number },
  rng: Rng = Math.random,
): CounterOutcome {
  const caster = by.sheet.caster!;
  if (by.sheet.edition === '2024') {
    const save = rollSave(of.sheet, 'con', caster.dc, rng);
    return save.success ? { countered: false, save } : { countered: true, save, keepsSlot: true };
  }
  if (level <= slot) return { countered: true };
  const dc = 10 + level;
  const check = { ...rollCheck(by.token, by.sheet, { ability: caster.ability, dc }, rng), dc };
  return { countered: !!check.success, check };
}

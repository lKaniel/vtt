import { type Rng, roll, type Roll } from '@vtt/shared';
import { abilityMod } from './creature-math.ts';
import type { Creature } from './creature.ts';
import { d20Formula } from './effects.ts';
import type { Ability } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// Ability checks and skill checks: rolled from the sheet, asked for by the
// GM (each creature for itself, as a group, or as a contest between two).

export interface CheckKind {
  ability: Ability;
  /** A skill using `ability`: proficiency is added when the creature has it. */
  skill?: string;
}

/** The check's bonus: the ability modifier, plus proficiency in the skill. */
export function checkBonus(
  token: Pick<Token, 'stats'>,
  sheet: Pick<Creature, 'abilities' | 'proficiency'>,
  check: CheckKind,
): number {
  const proficient = check.skill && token.stats?.skills?.includes(check.skill);
  return abilityMod(sheet.abilities[check.ability]) + (proficient ? sheet.proficiency : 0);
}

/** Poisoned and frightened creatures roll checks with disadvantage. */
const HINDERED = ['poisoned', 'frightened'];

export interface CheckRoll {
  roll?: Roll;
  total: number;
  /** Against a DC; undefined without one. */
  success?: boolean;
}

/** Rolls the check, with its effects' disadvantage and bonus dice, against `dc` when there is one. */
export function rollCheck(
  token: Pick<Token, 'stats'>,
  sheet: Creature,
  check: CheckKind & { dc?: number },
  rng: Rng = Math.random,
): CheckRoll {
  const { dc } = check;
  const disadvantage =
    sheet.effects.some((e) => e.checkDisadvantage) || sheet.conditions.some((c) => HINDERED.includes(c));
  const extra = sheet.effects.flatMap((e) => (e.checkBonus ? [e.checkBonus] : []));
  const result = roll(d20Formula(checkBonus(token, sheet, check), extra, { disadvantage }), rng);
  return { roll: result, total: result.total, ...(dc !== undefined && { success: result.total >= dc }) };
}

/** How the GM asked: each creature for itself, the group as one, or a contest between two. */
export type CheckRequestKind = 'each' | 'group' | 'contest';

export interface CheckEntry {
  token: string;
  name: string;
  total?: number;
  success?: boolean;
}

/** The group's or the contest's result once everyone has rolled; undefined before, or for separate checks. */
export function checkOutcome(kind: CheckRequestKind, entries: readonly CheckEntry[]): string | undefined {
  if (kind === 'each' || entries.some((e) => e.total === undefined)) return undefined;
  if (kind === 'group') {
    const passed = entries.filter((e) => e.success).length;
    return passed * 2 >= entries.length ? 'The group succeeds' : 'The group fails';
  }
  const [a, b] = entries;
  if (!a || !b || a.total === b.total) return 'A tie: nothing changes';
  return `${a.total! > b.total! ? a.name : b.name} wins`;
}

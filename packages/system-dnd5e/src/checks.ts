import { type Rng, roll, type Roll } from '@vtt/shared';
import { abilityMod } from './creature-math.ts';
import type { Creature } from './creature.ts';
import { d20Formula, saveModifiers } from './effects.ts';
import type { Ability } from './stats-schema.ts';
import type { Token } from './token-schema.ts';
import { type Skill, SKILLS } from './origins.ts';

// Ability checks and skill checks: rolled from the sheet, asked for by the
// GM (each creature for itself, as a group, or as a contest between two).

export interface CheckKind {
  ability: Ability;
  /** A skill using `ability`: proficiency is added when the creature has it. */
  skill?: string;
  /** A saving throw in `ability` instead of a check. */
  save?: boolean;
}

/** The check's bonus: the ability modifier, plus proficiency in the skill; a save's bonus from the sheet. */
export function checkBonus(
  token: Pick<Token, 'stats'>,
  sheet: Pick<Creature, 'abilities' | 'proficiency' | 'saves'>,
  check: CheckKind,
): number {
  if (check.save) return sheet.saves[check.ability];
  const proficient = check.skill && token.stats?.skills?.includes(check.skill);
  return abilityMod(sheet.abilities[check.ability]) + (proficient ? sheet.proficiency : 0);
}

/** A passive score (passive Perception): 10 plus the skill's bonus. */
export function passiveScore(
  token: Pick<Token, 'stats'>,
  sheet: Pick<Creature, 'abilities' | 'proficiency' | 'saves'>,
  skill: Skill,
): number {
  return 10 + checkBonus(token, sheet, { ability: SKILLS[skill], skill });
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
  if (check.save) return rolledSave(token, sheet, check, rng);
  const disadvantage =
    sheet.effects.some(
      (e) => e.checkDisadvantage === true || e.checkDisadvantageFor?.includes(check.ability) === true,
    ) || sheet.conditions.some((c) => HINDERED.includes(c));
  const extra = sheet.effects.flatMap((e) => (e.checkBonus ? [e.checkBonus] : []));
  const result = roll(d20Formula(checkBonus(token, sheet, check), extra, { disadvantage }), rng);
  return { roll: result, total: result.total, ...(dc !== undefined && { success: result.total >= dc }) };
}

/** A saving throw rolled from the sheet or a request card, with the effects' advantage, disadvantage and dice. */
function rolledSave(
  token: Pick<Token, 'stats'>,
  sheet: Creature,
  check: CheckKind & { dc?: number },
  rng: Rng,
): CheckRoll {
  const mods = saveModifiers(sheet, check.ability);
  const result = roll(d20Formula(checkBonus(token, sheet, check), mods.bonus, mods), rng);
  const success = mods.autoFail ? false : result.total >= (check.dc ?? 0);
  return { roll: result, total: result.total, ...(check.dc !== undefined && { success }) };
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

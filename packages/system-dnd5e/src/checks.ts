import { type Rng, roll, type Roll } from '@vtt/shared';
import { abilityMod } from './creature-math.ts';
import type { Creature } from './creature.ts';
import { d20Formula, type SaveRoll, saveModifiers } from './effects.ts';
import { type RollChoice, withPick } from './roll-choice.ts';
import type { Effect } from './spell-schema.ts';
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
  /** A skill with no ability (a campaign's): its bonus is the creature's typed `stats.skillValues` value, nothing else. */
  free?: boolean;
  /** A check with a tool (thieves' tools): proficiency is added when the creature is trained with it. */
  tool?: string;
}

/** A check as it is rolled: against `dc` when there is one, with the roller's own pick for the d20 and a situational modifier. */
type CheckRolled = CheckKind & { dc?: number } & Pick<RollChoice, 'edge' | 'd20' | 'situational'>;

type CheckSheet = Pick<Creature, 'abilities' | 'proficiency' | 'saves'> &
  Partial<Pick<Creature, 'features' | 'proficiencies' | 'skills' | 'expertise'>>;

/** Proficiency in the skill (twice with expertise) or the tool, if the creature has it. */
function trainedBonus(token: Pick<Token, 'stats'>, sheet: CheckSheet, { skill, tool }: CheckKind): number | undefined {
  if (tool) return sheet.proficiencies?.includes(tool) ? sheet.proficiency : undefined;
  if (!skill) return undefined;
  const has = (own: string[] | undefined, block: string[] | undefined) =>
    !!own?.includes(skill) || !!block?.includes(skill);
  if (has(token.stats?.expertise, sheet.expertise)) return 2 * sheet.proficiency;
  return has(token.stats?.skills, sheet.skills) ? sheet.proficiency : undefined;
}

/** Proficiency the check adds: twice with expertise, half (Jack of All Trades) without proficiency. */
function proficiencyFor(token: Pick<Token, 'stats'>, sheet: CheckSheet, check: CheckKind): number {
  const trained = trainedBonus(token, sheet, check);
  if (trained !== undefined) return trained;
  const jack = sheet.features?.some((f) => f.id === 'jack-of-all-trades');
  return jack ? Math.floor(sheet.proficiency / 2) : 0;
}

/** The check's bonus: the ability modifier, plus proficiency in the skill; a save's bonus from the sheet. */
export function checkBonus(token: Pick<Token, 'stats'>, sheet: CheckSheet, check: CheckKind): number {
  if (check.save) return sheet.saves[check.ability];
  if (check.free && check.skill) return token.stats?.skillValues?.[check.skill] ?? 0;
  return abilityMod(sheet.abilities[check.ability]) + proficiencyFor(token, sheet, check);
}

/** A passive score (passive Perception): 10 plus the skill's bonus. */
export function passiveScore(token: Pick<Token, 'stats'>, sheet: CheckSheet, skill: Skill): number {
  return 10 + checkBonus(token, sheet, { ability: SKILLS[skill], skill });
}

/** Poisoned and frightened creatures roll checks with disadvantage. */
const HINDERED = ['poisoned', 'frightened'];

export interface CheckRoll {
  roll?: Roll;
  total: number;
  /** Against a DC; undefined without one. */
  success?: boolean;
  /** Effects that last for one check and are now used up (2014 guidance). */
  used?: string[];
}

/** Rolls the check, with its effects' advantage, disadvantage and bonus dice, against `dc` when there is one. */
export function rollCheck(
  token: Pick<Token, 'stats'>,
  sheet: Creature,
  check: CheckRolled,
  rng: Rng = Math.random,
): CheckRoll {
  const { dc } = check;
  if (check.save) return rolledSave(token, sheet, check, rng);
  const mods = withPick(checkModifiers(sheet, check), check);
  const result = roll(d20Formula(checkBonus(token, sheet, check), mods.bonus, mods), rng);
  return {
    roll: result,
    total: result.total,
    ...(dc !== undefined && { success: result.total >= dc }),
    ...(mods.used.length && { used: mods.used }),
  };
}

/** How a check's or save's d20 would be rolled as things stand, before any pick: what the roll dialog shows first. */
export function checkEdge(sheet: Creature, check: CheckKind): { advantage: boolean; disadvantage: boolean } {
  return check.save ? saveModifiers(sheet, check.ability) : checkModifiers(sheet, check);
}

/** Advantage, disadvantage and bonus dice effects give a check, and the one-check effects it uses up (2014 guidance). */
function checkModifiers(sheet: Creature, check: CheckKind) {
  const { effects } = sheet;
  const disadvantage =
    effects.some((e) => e.checkDisadvantage === true || e.checkDisadvantageFor?.includes(check.ability) === true) ||
    sheet.conditions.some((c) => HINDERED.includes(c));
  const advantage = hasCheckAdvantage(sheet, check);
  const skilled = (e: Effect) => (check.skill ? e.skillBonus?.[check.skill] : undefined);
  const giving = effects.filter((e) => (e.checkBonus ?? skilled(e)) !== undefined);
  const bonus = giving.flatMap((e) => [e.checkBonus, skilled(e)].filter((d): d is string => !!d));
  return { advantage, disadvantage, bonus, used: giving.filter((e) => e.once).map((e) => e.id) };
}

/** Whether an effect gives the check advantage: its ability, its skill (a cloak of elvenkind's stealth). */
function hasCheckAdvantage(sheet: Creature, check: CheckKind): boolean {
  const names = [check.ability, check.skill].filter((n): n is string => !!n);
  return sheet.effects.some((e) => e.checkAdvantageFor?.some((a) => names.includes(a)));
}

/** A saving throw rolled from the sheet or a request card, with the effects' advantage, disadvantage and dice. */
function rolledSave(token: Pick<Token, 'stats'>, sheet: Creature, check: CheckRolled, rng: Rng): CheckRoll {
  const mods = withPick(saveModifiers(sheet, check.ability), check);
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

interface Side {
  token: Pick<Token, 'stats'>;
  sheet: Creature;
}

/** A contest as a save: `target`'s `ability` check against `caster`'s spellcasting check (its total is the DC); a tie goes to the target (2014 telekinesis). */
export function contest(ability: Ability, caster: Side, target: Side, rng: Rng = Math.random): SaveRoll {
  const theirs = rollCheck(caster.token, caster.sheet, { ability: caster.sheet.caster?.ability ?? 'int' }, rng);
  const mine = rollCheck(target.token, target.sheet, { ability }, rng);
  const success = mine.total >= theirs.total;
  return { ability, dc: theirs.total, roll: mine.roll, total: mine.total, success, check: true };
}

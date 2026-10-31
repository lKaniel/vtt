import { levelValue, spellSlots } from './classes.ts';
import { srdFor } from './content.ts';
import type { LevelTable } from './spell-schema.ts';
import type { Abilities, Ability, Edition } from './stats-schema.ts';

// The numbers a character is built from: point buy, ability score
// improvements and how many spells each class picks. SRD 5.1 and 5.2 tables.

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
export const POINT_BUY_BUDGET = 27;
const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

/** Points spent on these scores, or undefined when one is outside 8 to 15. */
export function pointBuyCost(scores: Record<Ability, number>): number | undefined {
  let total = 0;
  for (const score of Object.values(scores)) {
    const cost = POINT_COST[score];
    if (cost === undefined) return undefined;
    total += cost;
  }
  return total;
}

/** Levels that give an ability score improvement. */
export function asiLevels(classId: string): number[] {
  const extra: Record<string, number[]> = { fighter: [6, 14], rogue: [10] };
  return [4, 8, 12, 16, 19, ...(extra[classId] ?? [])].sort((a, b) => a - b);
}

export function isImprovementLevel(classId: string, level: number): boolean {
  return asiLevels(classId).includes(level);
}

export function hitPointsAtLevel1(hitDie: number, conMod: number): number {
  return Math.max(1, hitDie + conMod);
}

/** The fixed hit points a level gives instead of rolling: half the die, rounded up. */
export function averageHitDie(hitDie: number): number {
  return hitDie / 2 + 1;
}

// ---- Spells -------------------------------------------------------------

const table = (values: number[]): LevelTable => values.map((v, i) => [i + 1, v]);

const CANTRIPS: Record<string, LevelTable> = {
  bard: [
    [1, 2],
    [4, 3],
    [10, 4],
  ],
  cleric: [
    [1, 3],
    [4, 4],
    [10, 5],
  ],
  druid: [
    [1, 2],
    [4, 3],
    [10, 4],
  ],
  sorcerer: [
    [1, 4],
    [4, 5],
    [10, 6],
  ],
  warlock: [
    [1, 2],
    [4, 3],
    [10, 4],
  ],
  wizard: [
    [1, 3],
    [4, 4],
    [10, 5],
  ],
};

/** 2014 classes that know a fixed number of spells. */
const KNOWN_2014: Record<string, LevelTable> = {
  bard: table([4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22]),
  sorcerer: table([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15]),
  warlock: table([2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15]),
  ranger: table([0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11]),
};

const FULL_2024 = table([4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]);
const HALF_2024 = table([2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15]);

/** 2024: every caster prepares a number of spells from its class table. */
const PREPARED_2024: Record<string, LevelTable> = {
  bard: FULL_2024,
  cleric: FULL_2024,
  druid: FULL_2024,
  paladin: HALF_2024,
  ranger: HALF_2024,
  sorcerer: table([2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22]),
  warlock: KNOWN_2014.warlock!,
  wizard: table([4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 21, 22, 23]),
};

export interface SpellLimits {
  cantrips: number;
  /** Leveled spells known, prepared, or (2014 wizard) in the spellbook. */
  spells: number;
  /** Highest spell level the character has slots for. */
  maxLevel: number;
}

interface LimitQuery {
  classId: string;
  level: number;
  edition: Edition;
  /** The spellcasting ability modifier. */
  mod: number;
}

/** Spells a 2014 character of this class picks at this level. */
function spells2014({ classId, level, mod }: LimitQuery): number {
  const known = KNOWN_2014[classId];
  if (known) return levelValue(known, level);
  if (classId === 'wizard') return 6 + 2 * (level - 1);
  if (classId === 'paladin') return Math.max(1, mod + Math.floor(level / 2));
  return Math.max(1, mod + level);
}

export function spellLimits(q: LimitQuery): SpellLimits {
  const casting = srdFor(q.edition).classes.get(q.classId)?.spellcasting;
  const slots = casting ? spellSlots(casting, q.level) : [];
  const maxLevel = slots.findLastIndex((n) => n > 0) + 1;
  if (!maxLevel) return { cantrips: 0, spells: 0, maxLevel: 0 };
  const cantrips = levelValue(CANTRIPS[q.classId] ?? [], q.level);
  const spells = q.edition === '2024' ? levelValue(PREPARED_2024[q.classId] ?? [], q.level) : spells2014(q);
  return { cantrips, spells, maxLevel };
}

/** Ability scores after bonuses, capped at 20. */
export function addScores(base: Abilities, ...bonuses: Partial<Record<Ability, number>>[]): Abilities {
  const out = { ...base };
  for (const b of bonuses) for (const [k, v] of Object.entries(b)) out[k as Ability] += v;
  for (const k of Object.keys(out) as Ability[]) out[k] = Math.min(20, out[k]);
  return out;
}

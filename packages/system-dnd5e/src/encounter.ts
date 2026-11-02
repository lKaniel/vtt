import type { Edition } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// Experience and encounter building: XP by challenge rating, the XP a
// character needs for each level, and how hard a fight is for a party
// (2014: the DMG's thresholds with a multiplier for the number of monsters;
// 2024: an XP budget per character, no multiplier).

const XP_BY_CR: Record<string, number> = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10000,
  14: 11500,
  15: 13000,
  16: 15000,
  17: 18000,
  18: 20000,
  19: 22000,
  20: 25000,
  21: 33000,
  22: 41000,
  23: 50000,
  24: 62000,
  25: 75000,
  26: 90000,
  27: 105000,
  28: 120000,
  29: 135000,
  30: 155000,
};

/** The XP a creature of challenge rating `cr` is worth. */
export function xpForCr(cr: number): number {
  return XP_BY_CR[String(cr)] ?? 0;
}

/** XP needed for each level, index 0 = 1st. */
const LEVEL_XP = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000,
  265000, 305000, 355000,
];

/** The level `xp` experience points reach. */
export function levelForXp(xp: number): number {
  return LEVEL_XP.filter((needed) => xp >= needed).length;
}

/** The XP needed for the level after `level`; undefined at 20th. */
export function nextLevelXp(level: number): number | undefined {
  return LEVEL_XP[level];
}

/** The character with `xp` more experience. */
export function gainXp(token: Token, xp: number): Token {
  return { ...token, stats: { ...token.stats, xp: (token.stats?.xp ?? 0) + xp } };
}

/** 2014 thresholds per character: easy, medium, hard, deadly. */
const THRESHOLDS_2014: [number, number, number, number][] = [
  [25, 50, 75, 100],
  [50, 100, 150, 200],
  [75, 150, 225, 400],
  [125, 250, 375, 500],
  [250, 500, 750, 1100],
  [300, 600, 900, 1400],
  [350, 750, 1100, 1700],
  [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400],
  [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600],
  [1000, 2000, 3000, 4500],
  [1100, 2200, 3400, 5100],
  [1250, 2500, 3800, 5700],
  [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200],
  [2000, 3900, 5900, 8800],
  [2100, 4200, 6300, 9500],
  [2400, 4900, 7300, 10900],
  [2800, 5700, 8500, 12700],
];

/** 2024 XP budget per character: low, moderate, high. */
const BUDGET_2024: [number, number, number][] = [
  [50, 75, 100],
  [100, 150, 200],
  [150, 225, 400],
  [250, 375, 500],
  [500, 750, 1100],
  [600, 1000, 1400],
  [750, 1300, 1700],
  [1000, 1700, 2100],
  [1300, 2000, 2600],
  [1600, 2300, 3100],
  [1900, 2900, 4100],
  [2200, 3700, 4700],
  [2600, 4200, 5400],
  [2900, 4900, 6200],
  [3300, 5400, 7800],
  [3800, 6100, 9800],
  [4500, 7200, 11700],
  [5000, 8700, 14200],
  [5500, 10700, 17200],
  [6400, 13200, 22000],
];

const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

/** The 2014 multiplier step for this many monsters, one step up for a party under 3 and down for 6 or more. */
function multiplier(monsters: number, partySize: number): number {
  const steps = [1, 2, 3, 7, 11, 15];
  const step = steps.filter((n) => monsters >= n).length;
  let shift = 0;
  if (partySize < 3) shift = 1;
  if (partySize >= 6) shift = -1;
  return MULTIPLIERS[Math.min(MULTIPLIERS.length - 1, Math.max(0, step + shift))]!;
}

export type Difficulty2014 = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';
export type Difficulty2024 = 'trivial' | 'low' | 'moderate' | 'high' | 'beyond';

export interface EncounterRating {
  /** The monsters' XP, which the party shares when they win. */
  xp: number;
  /** The XP measured against the thresholds (2014: times the multiplier). */
  adjusted: number;
  /** The party's thresholds, by difficulty. */
  thresholds: Record<string, number>;
  difficulty: Difficulty2014 | Difficulty2024;
}

const sumColumns = (rows: readonly (readonly number[])[], width: number) =>
  Array.from({ length: width }, (_, i) => rows.reduce((n, r) => n + r[i]!, 0));

const rowFor = <T>(table: readonly T[], level: number): T => table[Math.min(20, Math.max(1, level)) - 1]!;

/** The highest named threshold `xp` reaches, or `below` when it reaches none. */
function rated<T extends string>(xp: number, names: readonly T[], values: readonly number[], below: T): T {
  let out = below;
  names.forEach((name, i) => {
    if (xp >= values[i]!) out = name;
  });
  return out;
}

function rate2024(xp: number, party: readonly number[]): EncounterRating {
  const values = sumColumns(
    party.map((l) => rowFor(BUDGET_2024, l)),
    3,
  );
  const thresholds = { low: values[0]!, moderate: values[1]!, high: values[2]! };
  const names: Difficulty2024[] = ['low', 'moderate', 'high', 'beyond'];
  const difficulty = rated(xp, names, [...values, thresholds.high + 1], 'trivial');
  return { xp, adjusted: xp, thresholds, difficulty };
}

function rate2014(xp: number, party: readonly number[], monsters: number): EncounterRating {
  const values = sumColumns(
    party.map((l) => rowFor(THRESHOLDS_2014, l)),
    4,
  );
  const adjusted = monsters ? xp * multiplier(monsters, party.length) : 0;
  const thresholds = { easy: values[0]!, medium: values[1]!, hard: values[2]!, deadly: values[3]! };
  const names: Difficulty2014[] = ['easy', 'medium', 'hard', 'deadly'];
  return { xp, adjusted, thresholds, difficulty: rated(adjusted, names, values, 'trivial') };
}

/** How hard a fight against monsters of challenge ratings `crs` is for characters of levels `party`. */
export function encounterDifficulty(
  party: readonly number[],
  crs: readonly number[],
  edition: Edition,
): EncounterRating {
  const xp = crs.reduce((n, cr) => n + xpForCr(cr), 0);
  const rating = edition === '2024' ? rate2024(xp, party) : rate2014(xp, party, crs.length);
  return party.length ? rating : { ...rating, difficulty: 'trivial' };
}

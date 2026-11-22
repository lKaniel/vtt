import type { Ability } from './stats-schema.ts';

const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export function abilityName(a: Ability): string {
  return ABILITY_NAMES[a];
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyForLevel(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

/** An ability score kept to what a sheet can hold: a whole number from 1 to 30. */
export const fitScore = (score: number): number => Math.min(30, Math.max(1, Math.trunc(score)));

/**
 * Scores as typed on a sheet, each fitted to 1–30 (a half-typed "158" is
 * 30), so a stray number never stops the creature from being worked out.
 */
export function fitScores<T extends Partial<Record<Ability, number>>>(scores: T): T {
  const fit = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? fitScore(v) : undefined);
  return Object.fromEntries(Object.entries(scores).map(([a, v]) => [a, fit(v)])) as T;
}

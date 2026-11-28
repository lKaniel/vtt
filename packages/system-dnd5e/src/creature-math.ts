import type { Abilities, Ability } from './stats-schema.ts';

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

/** An ability score as a sheet holds it: a whole number, any size, negative too. */
export const fitScore = (score: number): number => Math.trunc(score);

/**
 * Scores as typed on a sheet, each made a whole number (12.5 is 12) and
 * anything that isn't a number dropped, so a stray entry never stops the
 * creature from being worked out.
 */
export function fitScores<T extends Partial<Record<Ability, number>>>(scores: T): T {
  const fit = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? fitScore(v) : undefined);
  return Object.fromEntries(Object.entries(scores).map(([a, v]) => [a, fit(v)])) as T;
}

/** How much more (or less) a spell cast with another ability than the caster's own (`spellAbilities`) rolls with. */
export function spellAbilityShift(
  sheet: { abilities: Abilities; caster?: { ability: Ability; spellAbilities?: Partial<Record<string, Ability>> } },
  spell: string,
): number {
  const book = sheet.caster;
  const other = book?.spellAbilities?.[spell];
  return book && other ? abilityMod(sheet.abilities[other]) - abilityMod(sheet.abilities[book.ability]) : 0;
}

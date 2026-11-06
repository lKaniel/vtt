import {
  ABILITIES,
  type Ability,
  type Character,
  characterSkills,
  CUSTOM,
  type CustomBackground,
  type CustomSpecies,
  hasFreeBonuses,
  partsOf,
} from '@vtt/system-dnd5e';

// The creator's Custom options: a species and a background the player
// describes, ability bonuses placed BG3 style, and proficiencies beyond the
// class and background ones. Each takes a character and returns the copy.

export const NEW_SPECIES: CustomSpecies = {
  name: 'Custom species',
  size: 'medium',
  speed: 30,
  darkvision: 0,
  traits: [],
};

export function newBackground(c: Character): CustomBackground {
  return { name: 'Custom background', skills: [], ...(c.rules === '2024' && { abilities: [] }) };
}

export function editCustomSpecies(c: Character, patch: Partial<CustomSpecies>): Character {
  const customSpecies = { ...(c.customSpecies ?? NEW_SPECIES), ...patch };
  return { ...c, customSpecies, ...(c.species === CUSTOM && { size: customSpecies.size }) };
}

export function editCustomBackground(c: Character, patch: Partial<CustomBackground>): Character {
  return { ...c, customBackground: { ...(c.customBackground ?? newBackground(c)), ...patch } };
}

function toggled<T>(list: readonly T[], x: T, max: number): T[] {
  if (list.includes(x)) return list.filter((y) => y !== x);
  return list.length < max ? [...list, x] : [...list];
}

/** One of the custom background's two skills; the class can't give it again. */
export function toggleBackgroundSkill(c: Character, skill: string): Character {
  const bg = c.customBackground ?? newBackground(c);
  const skills = toggled(bg.skills as string[], skill, 2) as CustomBackground['skills'];
  return { ...editCustomBackground(c, { skills }), skills: c.skills.filter((s) => !skills.includes(s as never)) };
}

/** 2024: one of the three abilities the custom background raises; its bonuses start over. */
export function toggleBackgroundAbility(c: Character, ability: Ability): Character {
  const abilities = toggled(c.customBackground?.abilities ?? [], ability, 3);
  return { ...editCustomBackground(c, { abilities }), bonusPicks: {} };
}

/** Abilities the +2 and +1 may go to, or undefined when the species fixes the bonuses. */
export function flexibleBonusAbilities(c: Character): readonly Ability[] | undefined {
  if (c.rules === '2024') return partsOf(c).background?.abilities ?? [];
  return hasFreeBonuses(c) ? ABILITIES : undefined;
}

const isEach = (picks: Character['bonusPicks']) => Object.values(picks).filter((v) => v === 1).length === 3;

/** Puts the +2 or the +1 on `ability` (BG3's bonus columns); picking it again takes it off. */
export function pickFlexBonus(c: Character, ability: Ability, amount: 1 | 2): Character {
  if (!flexibleBonusAbilities(c)?.includes(ability)) return c;
  const picks = isEach(c.bonusPicks) ? {} : c.bonusPicks;
  const kept = Object.fromEntries(Object.entries(picks).filter(([a, v]) => a !== ability && v !== amount));
  if (picks[ability] === amount) return { ...c, bonusPicks: kept };
  return { ...c, bonusPicks: { ...kept, [ability]: amount } };
}

/** A skill proficiency beyond the class and background; dropping it drops its expertise. */
export function toggleExtraSkill(c: Character, skill: string): Character {
  const next = { ...c, extraSkills: toggled(c.extraSkills, skill, 18) };
  const known = characterSkills(next);
  return { ...next, expertise: next.expertise.filter((s) => known.includes(s)) };
}

/** Expertise in a skill the character is proficient in. */
export function toggleExpertise(c: Character, skill: string): Character {
  if (!c.expertise.includes(skill) && !characterSkills(c).includes(skill)) return c;
  return { ...c, expertise: toggled(c.expertise, skill, 18) };
}

/** Other proficiencies typed as a comma-separated list. */
export function setProficiencies(c: Character, text: string): Character {
  const seen = new Set<string>();
  const proficiencies = text
    .split(',')
    .map((s) => s.trim().slice(0, 60))
    .filter((s) => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
  return { ...c, proficiencies: proficiencies.slice(0, 30) };
}

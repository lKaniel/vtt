import { ABILITIES, type Ability, abilityName, type CheckKind, SKILLS, skillName } from '@vtt/system-dnd5e';

// How the check pickers name and encode a check: "dex" for an ability
// check, "dex:stealth" for a skill check, "dex:save" for a saving throw.

const short = (a: Ability) => a.charAt(0).toUpperCase() + a.slice(1);

export const CHECK_OPTIONS: readonly { value: string; label: string }[] = [
  ...ABILITIES.map((a) => ({ value: a, label: abilityName(a) })),
  ...Object.entries(SKILLS).map(([skill, a]) => ({
    value: `${a}:${skill}`,
    label: `${skillName(skill)} (${short(a)})`,
  })),
  ...ABILITIES.map((a) => ({ value: `${a}:save`, label: `${abilityName(a)} save` })),
];

export function checkOf(value: string): CheckKind {
  const [ability, skill] = value.split(':') as [Ability, string | undefined];
  if (skill === 'save') return { ability, save: true };
  return skill ? { ability, skill } : { ability };
}

export function checkValue(check: CheckKind): string {
  if (check.save) return `${check.ability}:save`;
  return check.skill ? `${check.ability}:${check.skill}` : check.ability;
}

const ABILITY_NAMES = new Map(ABILITIES.map((a) => [abilityName(a).toLowerCase(), a]));

/** A check by its name as written in text: "perception", "dex" or "dexterity". */
export function checkNamed(name: string): CheckKind | undefined {
  const key = name.toLowerCase();
  const skill = Object.entries(SKILLS).find(([s]) => s === key || skillName(s).toLowerCase() === key);
  if (skill) return { ability: skill[1], skill: skill[0] };
  const ability = (ABILITIES as readonly string[]).includes(key) ? (key as Ability) : ABILITY_NAMES.get(key);
  return ability && { ability };
}

/** Who a check is asked of: the selected creatures, else the party. */
export function askedOf<T extends { id: string; monster?: unknown }>(
  all: readonly T[],
  selected: (id: string) => boolean,
  party: (t: T) => boolean,
): T[] {
  const picked = all.filter((t) => selected(t.id));
  return picked.length ? picked : all.filter((t) => party(t) && !t.monster);
}

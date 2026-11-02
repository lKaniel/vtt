import { ABILITIES, type Ability, abilityName, type CheckKind, SKILLS, skillName } from '@vtt/system-dnd5e';

// How the check pickers name and encode a check: "dex" for an ability
// check, "dex:stealth" for a skill check.

const short = (a: Ability) => a.charAt(0).toUpperCase() + a.slice(1);

export const CHECK_OPTIONS: readonly { value: string; label: string }[] = [
  ...ABILITIES.map((a) => ({ value: a, label: abilityName(a) })),
  ...Object.entries(SKILLS).map(([skill, a]) => ({
    value: `${a}:${skill}`,
    label: `${skillName(skill)} (${short(a)})`,
  })),
];

export function checkOf(value: string): CheckKind {
  const [ability, skill] = value.split(':') as [Ability, string | undefined];
  return skill ? { ability, skill } : { ability };
}

export function checkValue(check: CheckKind): string {
  return check.skill ? `${check.ability}:${check.skill}` : check.ability;
}

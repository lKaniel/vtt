import {
  ABILITIES,
  type Ability,
  abilityName,
  type CheckKind,
  type Content,
  gameSkills,
  type SkillDef,
  skillCheck,
  TOOLS,
} from '@vtt/system-dnd5e';

// How the check pickers name and encode a check: "dex" for an ability
// check, "dex:stealth" for a skill check, "dex:tool:thieves-tools" for a
// tool check, "dex:save" for a saving throw, "wis:psychic-resistance:free"
// for a campaign skill that uses no ability (the creature's typed bonus).

const short = (a: Ability) => a.charAt(0).toUpperCase() + a.slice(1);

interface Option {
  value: string;
  label: string;
}

/** Every check the GM can ask for: abilities, the 18 skills and the game's own, tools, saves. */
export function checkOptions(content: Pick<Content, 'skills'> = {}): Option[] {
  return [
    ...ABILITIES.map((a) => ({ value: a, label: abilityName(a) })),
    ...gameSkills(content).map((s) => ({ value: checkValue(skillCheck(s)), label: skillLabel(s) })),
    ...Object.entries(TOOLS).map(([tool, { name, ability }]) => ({
      value: `${ability}:tool:${tool}`,
      label: `${name} (${short(ability)})`,
    })),
    ...ABILITIES.map((a) => ({ value: `${a}:save`, label: `${abilityName(a)} save` })),
  ];
}

const skillLabel = ({ name, ability }: SkillDef) => (ability === 'none' ? name : `${name} (${short(ability)})`);

export function checkOf(value: string): CheckKind {
  const [ability, skill, tool] = value.split(':') as [Ability, string | undefined, string | undefined];
  if (skill === 'save') return { ability, save: true };
  if (skill === 'tool' && tool) return { ability, tool };
  if (skill && tool === 'free') return { ability, skill, free: true };
  return skill ? { ability, skill } : { ability };
}

export function checkValue(check: CheckKind): string {
  if (check.save) return `${check.ability}:save`;
  if (check.tool) return `${check.ability}:tool:${check.tool}`;
  if (check.skill && check.free) return `${check.ability}:${check.skill}:free`;
  return check.skill ? `${check.ability}:${check.skill}` : check.ability;
}

const ABILITY_NAMES = new Map(ABILITIES.map((a) => [abilityName(a).toLowerCase(), a]));

/** A check by its name as written in text: "perception", "dex" or "dexterity" (or a skill the game adds). */
export function checkNamed(name: string, content: Pick<Content, 'skills'> = {}): CheckKind | undefined {
  const key = name.toLowerCase();
  const skill = gameSkills(content).find((s) => s.id === key || s.name.toLowerCase() === key);
  if (skill) return skillCheck(skill);
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

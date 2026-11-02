import {
  ABILITIES,
  type Ability,
  abilityMod,
  abilityScores,
  averageHitDie,
  type Character,
  characterClasses,
  type CreatorStep,
  type Edition,
  isImprovementLevel,
  issuesByStep,
  multiclassProblem,
  newCharacter,
  partsOf,
  POINT_BUY_BUDGET,
  pointBuyCost,
  type Spell,
  spellLimits,
  type SpellLimits,
  totalLevel,
} from '@vtt/system-dnd5e';

// The character creator's state changes, kept out of React so they can be
// tested. Each takes a character and returns the changed copy.

export function chooseSpecies(c: Character, species: string): Character {
  const found = partsOf({ ...c, species }).species;
  const size = found?.sizes.length === 1 ? found.sizes[0] : undefined;
  return { ...c, species, subspecies: undefined, size, bonusPicks: c.rules === '2014' ? {} : c.bonusPicks };
}

export function chooseClass(c: Character, cls: string): Character {
  return { ...c, class: cls, subclass: undefined, skills: [], spells: [], kit: {} };
}

export function chooseBackground(c: Character, background: string): Character {
  const next = { ...c, background, bonusPicks: c.rules === '2024' ? {} : c.bonusPicks };
  const given = partsOf(next).background?.skills ?? [];
  return { ...next, skills: c.skills.filter((s) => !given.includes(s)) };
}

/** Starts again in the other rules edition: the options differ too much to keep. */
export function setEdition(c: Character, rules: Edition): Character {
  return { ...newCharacter({ id: c.id, owner: c.owner, rules }), name: c.name, color: c.color, img: c.img };
}

// ---- Ability scores -----------------------------------------------------

export function pointsLeft(c: Character): number {
  return POINT_BUY_BUDGET - (pointBuyCost(c.base) ?? POINT_BUY_BUDGET);
}

export function adjustPointBuy(c: Character, ability: Ability, delta: 1 | -1): Character {
  const base = { ...c.base, [ability]: c.base[ability] + delta };
  const cost = pointBuyCost(base);
  return cost !== undefined && cost <= POINT_BUY_BUDGET ? { ...c, base } : c;
}

/** Gives `ability` the standard array `value`, swapping with whoever had it. */
export function assignStandard(c: Character, ability: Ability, value: number): Character {
  const holder = ABILITIES.find((a) => c.base[a] === value);
  const base = { ...c.base, [ability]: value };
  if (holder && holder !== ability) base[holder] = c.base[ability];
  return { ...c, base };
}

/** Six scores of 4d6, dropping the lowest die. */
export function rollAbilityScores(rng: () => number = Math.random): Record<Ability, number> {
  const d6 = () => Math.floor(rng() * 6) + 1;
  const one = () => {
    const dice = [d6(), d6(), d6(), d6()].sort((a, b) => a - b);
    return dice[1]! + dice[2]! + dice[3]!;
  };
  return Object.fromEntries(ABILITIES.map((a) => [a, one()])) as Record<Ability, number>;
}

/** A 2014 species' "+1 to two abilities": toggles one, up to the count. */
export function toggleBonusChoice(c: Character, ability: Ability): Character {
  const choice = partsOf(c).species?.bonusChoice;
  if (!choice) return c;
  if (c.bonusPicks[ability]) {
    return { ...c, bonusPicks: Object.fromEntries(Object.entries(c.bonusPicks).filter(([a]) => a !== ability)) };
  }
  if (Object.keys(c.bonusPicks).length >= choice.count || !choice.from.includes(ability)) return c;
  return { ...c, bonusPicks: { ...c.bonusPicks, [ability]: choice.amount } };
}

/** 2024 background bonuses: +2 and +1 to two of its abilities, or +1 to all three. */
export function setBackgroundBonus(c: Character, pick: 'each' | { plus2: Ability; plus1: Ability }): Character {
  const abilities = partsOf(c).background?.abilities ?? [];
  if (pick === 'each') return { ...c, bonusPicks: Object.fromEntries(abilities.map((a) => [a, 1])) };
  return { ...c, bonusPicks: { [pick.plus2]: 2, [pick.plus1]: 1 } };
}

// ---- Skills and spells --------------------------------------------------

function toggle(list: string[], id: string, max: number): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return list.length < max ? [...list, id] : list;
}

export function toggleSkill(c: Character, skill: string): Character {
  return { ...c, skills: toggle(c.skills, skill, partsOf(c).options?.skills.pick ?? 0) };
}

export interface SpellChoices {
  limits: SpellLimits;
  cantrips: Spell[];
  spells: Spell[];
}

/** The spells `c` may pick from `classId`'s list (its first class by default) at that class's `level`, cantrips apart. */
export function spellChoices(c: Character, level = c.level, classId = c.class): SpellChoices {
  const parts = partsOf(c);
  const ability = parts.book.content.classes.get(classId)?.spellcasting?.ability;
  const mod = ability ? abilityMod(abilityScores(c, parts)[ability]) : 0;
  const limits = spellLimits({ classId, level, edition: c.rules, mod });
  const list = [...parts.book.content.spells.values()]
    .filter((s) => s.classes.includes(classId) && s.level <= limits.maxLevel)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return { limits, cantrips: list.filter((s) => s.level === 0), spells: list.filter((s) => s.level > 0) };
}

export function toggleSpell(c: Character, id: string, level = c.level, classId = c.class): Character {
  const { limits, cantrips, spells } = spellChoices(c, level, classId);
  const isCantrip = cantrips.some((s) => s.id === id);
  const kind = isCantrip ? cantrips : spells;
  const sameKind = c.spells.filter((s) => kind.some((x) => x.id === s));
  const max = isCantrip ? limits.cantrips : limits.spells;
  if (c.spells.includes(id)) return { ...c, spells: c.spells.filter((s) => s !== id) };
  return sameKind.length < max ? { ...c, spells: [...c.spells, id] } : c;
}

// ---- Steps --------------------------------------------------------------

export type StepId = CreatorStep | 'equipment' | 'identity';

export interface StepInfo {
  id: StepId;
  label: string;
  issues: string[];
}

const LABELS: Record<StepId, string> = {
  species: 'Species',
  class: 'Class',
  background: 'Background',
  abilities: 'Abilities',
  skills: 'Skills',
  spells: 'Spells',
  equipment: 'Equipment',
  identity: 'Name & look',
  level: 'Level',
};

/** The creator's steps in order, each with what still needs fixing. */
export function creatorSteps(c: Character): StepInfo[] {
  const issues = issuesByStep(c);
  const hasSpells = spellChoices(c).limits.maxLevel > 0;
  const ids: StepId[] = ['species', 'class', 'background', 'abilities', 'skills', 'spells', 'equipment', 'identity'];
  return ids
    .filter((id) => id !== 'spells' || hasSpells)
    .map((id) => ({
      id,
      label: c.rules === '2014' && id === 'species' ? 'Race' : LABELS[id],
      issues: stepIssues(c, id, issues),
    }));
}

function stepIssues(c: Character, id: StepId, issues: Record<CreatorStep, string[]>): string[] {
  if (id === 'identity') return c.name.trim() ? [] : ['Name your character.'];
  if (id === 'spells' && !issues.spells.length) return spellsLeft(c);
  return id === 'equipment' ? [] : issues[id];
}

/** A new character should fill every spell pick, though the rules allow fewer. */
function spellsLeft(c: Character): string[] {
  const { limits, cantrips } = spellChoices(c);
  const picked = c.spells.filter((id) => cantrips.some((s) => s.id === id)).length;
  const left = [
    [limits.cantrips - picked, 'cantrip'],
    [limits.spells - (c.spells.length - picked), 'spell'],
  ] as const;
  const parts = left.filter(([n]) => n > 0).map(([n, word]) => `${n} more ${word}${n === 1 ? '' : 's'}`);
  return parts.length ? [`Pick ${parts.join(' and ')}.`] : [];
}

// ---- Level up -----------------------------------------------------------

export interface LevelUpPlan {
  /** The character's level after this one. */
  level: number;
  /** The class gaining the level, and its level in that class after. */
  classId: string;
  classLevel: number;
  hitDie: number;
  average: number;
  /** An ability score improvement is due. */
  improvement: boolean;
  /** The subclass is chosen at this level. */
  subclass: boolean;
  newCantrips: number;
  newSpells: number;
  /** Why the character can't take this class (multiclassing prerequisites). */
  problem?: string;
}

/** What a level in `classId` (the first class by default) brings. */
export function levelUpPlan(c: Character, classId = c.class): LevelUpPlan {
  const parts = partsOf(c);
  const taken = characterClasses(c).find((k) => k.class === classId);
  const classLevel = (taken?.level ?? 0) + 1;
  const hitDie = parts.book.content.classes.get(classId)?.hitDie ?? 8;
  const now = taken ? spellChoices(c, taken.level, classId).limits : { cantrips: 0, spells: 0 };
  const next = spellChoices(c, classLevel, classId).limits;
  const options = parts.book.origins.classes.find((o) => o.id === classId);
  const current = characterClasses(c).map((k) => k.class);
  const problem = multiclassProblem(abilityScores(c, parts), current, classId, parts.book.content);
  return {
    level: totalLevel(c) + 1,
    classId,
    classLevel,
    hitDie,
    average: averageHitDie(hitDie),
    improvement: isImprovementLevel(classId, classLevel),
    subclass: !taken?.subclass && classLevel >= (options?.subclassLevel ?? 99),
    newCantrips: Math.max(0, next.cantrips - now.cantrips),
    newSpells: Math.max(0, next.spells - now.spells),
    ...(problem && { problem }),
  };
}

/** "Level 3 Hill dwarf Cleric", or "Level 3 Human Fighter 2 / Wizard 1", for lists of characters. */
export function characterSummary(c: Character): string {
  const p = partsOf(c);
  const species = p.subspecies?.name ?? p.species?.name ?? c.species;
  const name = (id: string) => p.book.content.classes.get(id)?.name ?? id;
  if (c.multiclass.length) {
    const classes = characterClasses(c).map((k) => `${name(k.class)} ${k.level}`);
    return `Level ${totalLevel(c)} ${species} ${classes.join(' / ')}`;
  }
  const sub = p.options?.subclasses.find((s) => s.id === c.subclass)?.name;
  const line = `Level ${c.level} ${species} ${name(c.class)}`;
  return sub ? `${line} (${sub})` : line;
}

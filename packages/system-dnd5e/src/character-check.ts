import { abilityScores, type Character, type Parts, partsOf } from './character.ts';
import { isImprovementLevel, POINT_BUY_BUDGET, pointBuyCost, spellLimits, STANDARD_ARRAY } from './character-rules.ts';
import { abilityMod } from './creature-math.ts';
import { ABILITIES, type Ability } from './stats-schema.ts';

// Whether a character follows the rules of its edition. The creator shows
// these as hints; the server refuses to save a character that has any.

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

function listNames(abilities: readonly Ability[]): string {
  const names = abilities.map(abilityName);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}

const sum = (b: Partial<Record<Ability, number>>) => Object.values(b).reduce((a, v) => a + v, 0);

/** The creator's steps, each with its own rules to check. */
export type CreatorStep = 'species' | 'class' | 'background' | 'abilities' | 'skills' | 'spells' | 'level';

/** Everything wrong with a character, as sentences; empty when it's valid. */
export function characterIssues(c: Character): string[] {
  return Object.values(issuesByStep(c)).flat();
}

/** The issues grouped by the creator step that fixes them. */
export function issuesByStep(c: Character): Record<CreatorStep, string[]> {
  const p = partsOf(c);
  const none = { abilities: [], skills: [], spells: [], level: [] };
  const missing = {
    species: speciesIssues(c, p),
    class: p.cls && p.options ? [] : [`Unknown class "${c.class}".`],
    background: p.background ? [] : [`Unknown background "${c.background}".`],
  };
  if (Object.values(missing).some((m) => m.length)) return { ...missing, ...none };
  return {
    ...missing,
    class: subclassIssues(c, p),
    abilities: [...scoreIssues(c), ...bonusIssues(c, p)],
    skills: skillIssues(c, p),
    spells: spellIssues(c, p),
    level: levelIssues(c, p),
  };
}

function speciesIssues(c: Character, p: Parts): string[] {
  if (!p.species) return [`Unknown species "${c.species}".`];
  if (p.species.subspecies.length && !p.subspecies) {
    return [`Choose a ${c.rules === '2014' ? 'subrace' : 'lineage'} for ${p.species.name}.`];
  }
  if (p.species.sizes.length > 1 && !c.size) return [`Choose whether ${p.species.name}s are small or medium.`];
  return [];
}

function scoreIssues(c: Character): string[] {
  const scores = ABILITIES.map((a) => c.base[a]);
  if (c.method === 'point-buy') {
    const cost = pointBuyCost(c.base);
    if (cost === undefined) return ['Point buy scores go from 8 to 15.'];
    return cost > POINT_BUY_BUDGET ? [`Point buy spends ${cost} of ${POINT_BUY_BUDGET} points.`] : [];
  }
  if (c.method === 'standard' && [...scores].sort((a, b) => b - a).join() !== STANDARD_ARRAY.join()) {
    return ['Use each standard array score (15, 14, 13, 12, 10, 8) once.'];
  }
  if (c.method === 'roll' && scores.some((s) => s < 3 || s > 18)) return ['Rolled scores go from 3 to 18.'];
  return [];
}

function bonusIssues(c: Character, p: Parts): string[] {
  const picks = Object.entries(c.bonusPicks) as [Ability, number][];
  if (c.rules === '2024') return backgroundBonusIssues(picks, p);
  const choice = p.species?.bonusChoice;
  if (!choice) return picks.length ? [`${p.species?.name} has no ability bonuses to pick.`] : [];
  const ok = picks.length === choice.count && picks.every(([a, v]) => choice.from.includes(a) && v === choice.amount);
  return ok ? [] : [`Pick +${choice.amount} for ${choice.count} of ${listNames(choice.from)}.`];
}

function backgroundBonusIssues(picks: [Ability, number][], p: Parts): string[] {
  const allowed = p.background?.abilities ?? [];
  if (picks.some(([a]) => !allowed.includes(a))) return [`${p.background?.name} raises only ${listNames(allowed)}.`];
  const values = picks.map(([, v]) => v).sort((a, b) => a - b);
  const ok = values.join() === '1,2' || values.join() === '1,1,1';
  return ok ? [] : ['Give one ability +2 and another +1, or three +1.'];
}

function skillIssues(c: Character, p: Parts): string[] {
  const { pick, from } = p.options!.skills;
  const out: string[] = [];
  if (c.skills.length !== pick || new Set(c.skills).size !== pick) out.push(`Choose ${pick} class skills.`);
  for (const s of c.skills) if (!from.includes(s)) out.push(`${p.cls!.name}s can't pick "${s}".`);
  return out;
}

function levelIssues(c: Character, p: Parts): string[] {
  const out: string[] = [];
  const die = p.cls!.hitDie;
  if (c.hpRolls.length !== c.level - 1) out.push('Roll or take average hit points for each level after 1st.');
  for (const r of c.hpRolls) if (r > die) out.push(`A d${die} can't roll ${r}.`);
  const due = Array.from({ length: c.level }, (_, i) => i + 1).filter((l) => isImprovementLevel(c.class, l)).length;
  if (c.improvements.length !== due || c.improvements.some((b) => sum(b) !== 2)) {
    out.push(`Take ${due} ability score improvement${due === 1 ? '' : 's'} (2 points each).`);
  }
  return out;
}

function subclassIssues(c: Character, p: Parts): string[] {
  const { subclasses, subclassLevel } = p.options!;
  if (c.subclass && !subclasses.some((s) => s.id === c.subclass)) return [`Unknown subclass "${c.subclass}".`];
  if (!c.subclass && c.level >= subclassLevel && subclasses.length) return [`Choose a ${p.cls!.name} subclass.`];
  return [];
}

function spellIssues(c: Character, p: Parts): string[] {
  const mod = p.cls!.spellcasting ? abilityMod(abilityScores(c, p)[p.cls!.spellcasting.ability]) : 0;
  const limits = spellLimits({ classId: c.class, level: c.level, edition: c.rules, mod });
  const spells = c.spells.map((id) => ({ id, spell: p.book.content.spells.get(id) }));
  const out: string[] = [];
  for (const { id, spell } of spells) {
    if (!spell) out.push(`Unknown spell "${id}".`);
    else if (!spell.classes.includes(c.class) || spell.level > limits.maxLevel) {
      out.push(`${spell.name} isn't a level ${limits.maxLevel} or lower ${c.class} spell.`);
    }
  }
  const cantrips = spells.filter((s) => s.spell?.level === 0).length;
  if (cantrips > limits.cantrips) out.push(`Choose at most ${limits.cantrips} cantrips.`);
  if (spells.length - cantrips > limits.spells) out.push(`Choose at most ${limits.spells} spells.`);
  return out;
}

/** What the player picks when levelling up. */
export interface LevelUpChoice {
  /** Hit points this level adds before Constitution: a roll or the average. */
  hp: number;
  improvement?: Partial<Record<Ability, number>>;
  subclass?: string;
  /** The full spell list after levelling, when it changed. */
  spells?: string[];
}

export function levelUp(c: Character, choice: LevelUpChoice): Character {
  const level = c.level + 1;
  return {
    ...c,
    level,
    hpRolls: [...c.hpRolls, choice.hp],
    improvements: choice.improvement ? [...c.improvements, choice.improvement] : c.improvements,
    subclass: choice.subclass ?? c.subclass,
    spells: choice.spells ?? c.spells,
  };
}

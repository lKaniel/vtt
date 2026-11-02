import { abilityScores, type Character, characterClasses, type Parts, partsOf, totalLevel } from './character.ts';
import { multiclassProblem } from './multiclass.ts';
import {
  isImprovementLevel,
  POINT_BUY_BUDGET,
  pointBuyCost,
  type SpellLimits,
  spellLimits,
  STANDARD_ARRAY,
} from './character-rules.ts';
import { abilityMod, abilityName } from './creature-math.ts';
import { ABILITIES, type Ability } from './stats-schema.ts';

// Whether a character follows the rules of its edition. The creator shows
// these as hints; the server refuses to save a character that has any.

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
    class: [...subclassIssues(c, p), ...multiclassIssues(c, p)],
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

/** Ability score improvements the classes give at their levels. */
function improvementsDue(c: Character): number {
  return characterClasses(c).reduce(
    (n, k) => n + Array.from({ length: k.level }, (_, i) => i + 1).filter((l) => isImprovementLevel(k.class, l)).length,
    0,
  );
}

function levelIssues(c: Character, p: Parts): string[] {
  const out: string[] = [];
  const die = Math.max(p.cls!.hitDie, ...c.multiclass.map((m) => p.book.content.classes.get(m.class)?.hitDie ?? 0));
  if (c.hpRolls.length !== totalLevel(c) - 1) out.push('Roll or take average hit points for each level after 1st.');
  for (const r of c.hpRolls) if (r > die) out.push(`A d${die} can't roll ${r}.`);
  const due = improvementsDue(c);
  if (c.improvements.length !== due || c.improvements.some((b) => sum(b) !== 2)) {
    out.push(`Take ${due} ability score improvement${due === 1 ? '' : 's'} (2 points each).`);
  }
  return out;
}

function subclassIssues(c: Character, p: Parts): string[] {
  return characterClasses(c).flatMap((k) => {
    const options = p.book.origins.classes.find((o) => o.id === k.class);
    if (!options) return [];
    const { subclasses, subclassLevel } = options;
    if (k.subclass && !subclasses.some((s) => s.id === k.subclass)) return [`Unknown subclass "${k.subclass}".`];
    if (!k.subclass && k.level >= subclassLevel && subclasses.length) {
      return [`Choose a ${p.book.content.classes.get(k.class)?.name ?? k.class} subclass.`];
    }
    return [];
  });
}

/** Each class taken after the first needs its prerequisites, and the earlier classes' too. */
function multiclassIssues(c: Character, p: Parts): string[] {
  const scores = abilityScores(c, p);
  const taken = [c.class];
  const out: string[] = [];
  for (const m of c.multiclass) {
    if (!p.book.content.classes.has(m.class)) out.push(`Unknown class "${m.class}".`);
    else if (taken.includes(m.class)) out.push(`${m.class} is listed twice.`);
    else {
      const problem = multiclassProblem(scores, taken, m.class, p.book.content);
      if (problem) out.push(`${problem}.`);
    }
    taken.push(m.class);
  }
  return out;
}

/** Spell limits of each class at its level; a multiclassed caster picks from each list. */
function classSpellLimits(c: Character, p: Parts): { classId: string; limits: SpellLimits }[] {
  const scores = abilityScores(c, p);
  return characterClasses(c).map((k) => {
    const ability = p.book.content.classes.get(k.class)?.spellcasting?.ability;
    const mod = ability ? abilityMod(scores[ability]) : 0;
    return { classId: k.class, limits: spellLimits({ classId: k.class, level: k.level, edition: c.rules, mod }) };
  });
}

function spellIssues(c: Character, p: Parts): string[] {
  const perClass = classSpellLimits(c, p);
  const spells = c.spells.map((id) => ({ id, spell: p.book.content.spells.get(id) }));
  const out: string[] = [];
  for (const { id, spell } of spells) {
    if (!spell) out.push(`Unknown spell "${id}".`);
    else if (!perClass.some((k) => spell.classes.includes(k.classId) && spell.level <= k.limits.maxLevel)) {
      const k = perClass[0]!;
      out.push(`${spell.name} isn't a level ${k.limits.maxLevel} or lower ${k.classId} spell.`);
    }
  }
  const cantripLimit = perClass.reduce((n, k) => n + k.limits.cantrips, 0);
  const spellLimit = perClass.reduce((n, k) => n + k.limits.spells, 0);
  const cantrips = spells.filter((s) => s.spell?.level === 0).length;
  if (cantrips > cantripLimit) out.push(`Choose at most ${cantripLimit} cantrips.`);
  if (spells.length - cantrips > spellLimit) out.push(`Choose at most ${spellLimit} spells.`);
  return out;
}

/** What the player picks when levelling up. */
export interface LevelUpChoice {
  /** Hit points this level adds before Constitution: a roll or the average. */
  hp: number;
  improvement?: Partial<Record<Ability, number>>;
  /** The class gaining the level: the first class by default, or another to multiclass into. */
  class?: string;
  /** The subclass of the class gaining the level, when it reaches the subclass level. */
  subclass?: string;
  /** The full spell list after levelling, when it changed. */
  spells?: string[];
}

export function levelUp(c: Character, choice: LevelUpChoice): Character {
  const common = {
    ...c,
    hpRolls: [...c.hpRolls, choice.hp],
    improvements: choice.improvement ? [...c.improvements, choice.improvement] : c.improvements,
    spells: choice.spells ?? c.spells,
  };
  const into = choice.class ?? c.class;
  if (into === c.class) return { ...common, level: c.level + 1, subclass: choice.subclass ?? c.subclass };
  const known = c.multiclass.some((m) => m.class === into);
  const multiclass = known ? c.multiclass : [...c.multiclass, { class: into, level: 0 }];
  return {
    ...common,
    multiclass: multiclass.map((m) =>
      m.class === into ? { ...m, level: m.level + 1, ...(choice.subclass && { subclass: choice.subclass }) } : m,
    ),
  };
}

import type { Content } from './content.ts';
import { abilityName } from './creature-math.ts';
import type { Class, Spellcasting } from './spell-schema.ts';
import type { Abilities, Ability, Edition, Stats } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// Multiclassing: a character's levels split over several classes. Each class
// grants its features at its own level; proficiency and cantrips follow the
// total level; spell slots come from the combined caster level.

export interface ClassLevel {
  /** The id as written (lowercased), even for a class the content doesn't have. */
  id: string;
  cls?: Class;
  level: number;
  subclass?: string;
}

/** The class `name` names, by id or by name. */
export function findClass(name: string | undefined, content: Content): Class | undefined {
  const key = name?.toLowerCase();
  if (!key) return undefined;
  return content.classes.get(key) ?? [...content.classes.values()].find((c) => c.name.toLowerCase() === key);
}

/** A creature's classes and the levels in each: `stats.classes`, or its one `class` at `level`. */
export function classLevels(token: Pick<Token, 'stats'>, content: Content): ClassLevel[] {
  const stats = token.stats;
  const list = stats?.classes ?? (stats?.class ? [{ class: stats.class, level: stats.level ?? 1 }] : []);
  return list.map((c) => {
    const cls = findClass(c.class, content);
    const subclass = 'subclass' in c ? c.subclass : undefined;
    return { id: cls?.id ?? c.class.toLowerCase(), cls, level: c.level, ...(subclass && { subclass }) };
  });
}

/** The character's total level: its classes' levels added up, or `level`. */
export function characterLevel(stats: Stats | undefined): number | undefined {
  if (stats?.classes) return stats.classes.reduce((n, c) => n + c.level, 0);
  return stats?.level;
}

/** "Fighter 3 / Wizard 2", or just the class name when it has one class. */
export function classesText(stats: Stats | undefined): string | undefined {
  if (stats?.classes) return stats.classes.map((c) => `${capital(c.class)} ${c.level}`).join(' / ');
  return stats?.class && capital(stats.class);
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Why the stats are ambiguous about the creature's classes, if they are. */
export function classIssues(stats: Stats | undefined): string[] {
  const both = stats?.classes && (stats.class !== undefined || stats.level !== undefined);
  return both ? ['use classes or class and level, not both'] : [];
}

/** A caster class's share of the multiclass caster level: half (rounded up in 2024 and for classes casting from 1st level) or a third. */
function casterShare(casting: Spellcasting, level: number, edition: Edition): number {
  const up = edition === '2024' || casting.from === 1;
  if (casting.progression === 'half') return up ? Math.ceil(level / 2) : Math.floor(level / 2);
  if (casting.progression === 'third') return up ? Math.ceil(level / 3) : Math.floor(level / 3);
  return level;
}

/** The combined caster level of the classes that aren't pact casters. */
export function multiclassCasterLevel(levels: readonly CastingLevel[], edition: Edition): number {
  return levels.reduce((n, l) => n + (l.level < l.casting.from ? 0 : casterShare(l.casting, l.level, edition)), 0);
}

export interface CastingLevel {
  casting: Spellcasting;
  level: number;
}

/** The classes that cast spells (some maybe not yet at their level), with their spellcasting. */
export function castingLevels(levels: readonly ClassLevel[]): CastingLevel[] {
  return levels.flatMap((l) => (l.cls?.spellcasting ? [{ casting: l.cls.spellcasting, level: l.level }] : []));
}

const has13 = (abilities: Abilities, a: Ability) => abilities[a] >= 13;

/** What a class's prerequisites miss in these scores, as "Strength or Dexterity 13". */
function missing(cls: Class, abilities: Abilities): string | undefined {
  const { all = [], any = [] } = cls.multiclass ?? {};
  const lacking = all.find((a) => !has13(abilities, a));
  if (lacking) return `${abilityName(lacking)} 13`;
  if (any.length && !any.some((a) => has13(abilities, a))) return `${any.map(abilityName).join(' or ')} 13`;
  return undefined;
}

/** Why a character with `current` classes can't take a level in `next`, or undefined if it can. */
export function multiclassProblem(
  abilities: Abilities,
  current: readonly string[],
  next: string,
  content: Content,
): string | undefined {
  if (current.includes(next)) return undefined;
  const cls = findClass(next, content);
  if (!cls) return `Unknown class "${next}"`;
  const into = missing(cls, abilities);
  if (into) return `Multiclassing into ${cls.name} needs ${into}`;
  for (const id of current) {
    const from = findClass(id, content);
    const out = from && missing(from, abilities);
    if (out) return `Multiclassing out of ${from.name} needs ${out}`;
  }
  return undefined;
}

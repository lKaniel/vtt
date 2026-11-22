import { classSpellLimits, improvementsDue } from './character-check.ts';
import { averageHitDie } from './character-rules.ts';
import { type Character, characterClasses, type Parts, partsOf, totalLevel } from './character.ts';
import { choicesDue } from './class-options.ts';
import type { Content } from './content.ts';
import { abilityMod, fitScores } from './creature-math.ts';
import { classLevels } from './multiclass.ts';
import { originsFor } from './origins.ts';
import type { Class } from './spell-schema.ts';
import { AbilitiesSchema, type Edition, type Stats } from './stats-schema.ts';

// Taking a level back (a level gained by mistake, a GM's ruling): the
// reverse of a level up, for characters made with the creator (their build
// loses the level's hit points, improvement, subclass, options and the
// spells it allowed) and for characters that are only an actor (a class
// level and its average hit points).

/** The level a class takes its subclass at. */
function subclassLevel(cls: Pick<Class, 'id' | 'subclassLevel'> | undefined, id: string, edition: Edition): number {
  const options = originsFor(edition).classes.find((o) => o.id === id);
  return cls?.subclassLevel ?? options?.subclassLevel ?? 3;
}

function checkLevels(name: string, total: number, has: boolean, classId: string): void {
  if (!has) throw new Error(`${name} has no levels in ${classId}`);
  if (total <= 1) throw new Error(`${name} is already 1st level`);
}

/** `c` a level lower in `classId`; throws an Error when it can't be. */
export function levelDown(c: Character, classId: string): Character {
  const p = partsOf(c);
  checkLevels(
    c.name,
    totalLevel(c),
    characterClasses(c).some((k) => k.class === classId),
    classId,
  );
  const lowered = lowerClass(c, classId, p);
  const kept: Character = {
    ...lowered,
    hpRolls: c.hpRolls.slice(0, -1),
    improvements: c.improvements.slice(0, improvementsDue(lowered)),
  };
  const fitted = { ...kept, features: fittingFeatures(kept, p) };
  return { ...fitted, spells: fittingSpells(fitted, p) };
}

/** `c` with one level less in `classId`: a later class at none leaves, a subclass below its level goes. */
function lowerClass(c: Character, classId: string, p: Parts): Character {
  const due = (id: string) => subclassLevel(p.book.content.classes.get(id), id, c.rules);
  if (classId === c.class) {
    if (c.level <= 1) throw new Error(`${classId} was ${c.name}'s 1st level; take a level from another class first`);
    const level = c.level - 1;
    return { ...c, level, subclass: level >= due(classId) ? c.subclass : undefined };
  }
  const multiclass = c.multiclass
    .map((m) => (m.class === classId ? { ...m, level: m.level - 1 } : m))
    .filter((m) => m.level > 0)
    .map(({ subclass, ...m }) => ({ ...m, ...(subclass && m.level >= due(m.class) && { subclass }) }));
  return { ...c, multiclass };
}

/** The class options still picked at the classes' levels (a fighting style goes with its fighter level). */
function fittingFeatures(c: Character, p: Parts): string[] {
  const keep = new Set(characterClasses(c).flatMap((k) => keptOptions(c, p, k)));
  return c.features.filter((f) => keep.has(f));
}

/** One class's picked options its level still offers, as many as it may pick, as "<class>/<feature>". */
function keptOptions(c: Character, p: Parts, k: { class: string; level: number; subclass?: string }): string[] {
  const cls = p.book.content.classes.get(k.class);
  const due = cls ? choicesDue(cls, k.level, c.features, k.subclass) : [];
  return due.flatMap((d) => {
    const offered = new Set(d.options.map((o) => o.id));
    return d.picked
      .filter((id) => offered.has(id))
      .slice(0, d.count)
      .map((id) => `${k.class}/${id}`);
  });
}

/** The spells the classes still allow, the last picked going first when there are too many. */
function fittingSpells(c: Character, p: Parts): string[] {
  const perClass = classSpellLimits(c, p);
  const allowed = c.spells.filter((id) => {
    const spell = p.book.content.spells.get(id);
    return !!spell && perClass.some((k) => spell.classes.includes(k.classId) && spell.level <= k.limits.maxLevel);
  });
  const cantripLimit = perClass.reduce((n, k) => n + k.limits.cantrips, 0);
  const spellLimit = perClass.reduce((n, k) => n + k.limits.spells, 0);
  const isCantrip = (id: string) => p.book.content.spells.get(id)?.level === 0;
  const cantrips = allowed.filter(isCantrip).slice(0, cantripLimit);
  const spells = allowed.filter((id) => !isCantrip(id)).slice(0, spellLimit);
  return allowed.filter((id) => cantrips.includes(id) || spells.includes(id));
}

/** An actor's stats a level lower in `classId`; throws an Error when it can't be. */
export function levelDownActor(stats: Stats, classId: string, content: Content): Stats {
  const levels = classLevels({ stats }, content);
  const total = levels.reduce((n, l) => n + l.level, 0);
  const at = levels.find((l) => l.id === classId);
  checkLevels('The character', total, !!at, classId);
  const due = subclassLevel(at!.cls, at!.id, content.edition);
  const classes = levels
    .map((l) => ({ class: l.cls?.id ?? l.id, level: l.id === classId ? l.level - 1 : l.level, subclass: l.subclass }))
    .filter((l) => l.level > 0)
    .map(({ subclass, ...l }) => ({ ...l, ...(subclass && (l.class !== classId || l.level >= due) && { subclass }) }));
  const { class: _class, level: _level, ...rest } = stats;
  return { ...rest, classes, ...lowerHp(stats, at!.cls?.hitDie ?? 8) };
}

/** A written maximum loses the level's average hit points and Constitution. */
function lowerHp(stats: Stats, hitDie: number): Pick<Stats, 'maxHp'> {
  if (stats.maxHp === undefined) return {};
  const con = abilityMod(AbilitiesSchema.parse(fitScores({ ...stats.abilities })).con);
  return { maxHp: Math.max(1, stats.maxHp - Math.max(1, averageHitDie(hitDie) + con)) };
}

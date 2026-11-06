import { asiLevels, averageHitDie } from './character-rules.ts';
import type { Content } from './content.ts';
import { classHp } from './creature.ts';
import { abilityMod } from './creature-math.ts';
import { characterLevel, classLevels, findClass } from './multiclass.ts';
import { originsFor } from './origins.ts';
import type { Class } from './spell-schema.ts';
import { type Abilities, AbilitiesSchema, ABILITIES, type Ability, type Edition, type Stats } from './stats-schema.ts';

// Levelling up a character that is only an actor (imported from Foundry, or
// made by hand on its sheet), as the in-game Level up does: one more level
// in a class it has or a new one, hit points rolled or the average, the
// subclass once it is due, and an ability score improvement at its levels.
// Characters made with the creator level up through their build instead
// (character-check.ts `levelUp`).

export interface ActorLevelChoice {
  /** The class to take the level in: one the actor has, or a new one. */
  class: string;
  subclass?: string;
  /** The average, or what the hit die rolled. */
  hp: 'average' | number;
  /** Two points over one or two scores. */
  improvement?: Partial<Record<Ability, number>>;
}

export interface ActorLevelPlan {
  /** The character level reached. */
  level: number;
  /** The level reached in the chosen class. */
  classLevel: number;
  hitDie: number;
  average: number;
  /** An ability score improvement is due. */
  improvement: boolean;
  /** The subclasses to pick from now; none when one is already chosen or not yet due. */
  subclasses: { id: string; name: string }[];
  problem?: string;
}

/** What taking the next level in `classId` brings. */
export function actorLevelPlan(stats: Stats, classId: string, content: Content, edition: Edition): ActorLevelPlan {
  const level = (characterLevel(stats) ?? 0) + 1;
  const cls = findClass(classId, content);
  if (!cls) return { ...basePlan(level, 1, 8), problem: `No class "${classId}" in this game` };
  const entry = classLevels({ stats }, content).find((l) => l.cls?.id === cls.id);
  const classLevel = (entry?.level ?? 0) + 1;
  return {
    ...basePlan(level, classLevel, cls.hitDie),
    improvement: asiLevels(cls.id).includes(classLevel),
    subclasses: entry?.subclass ? [] : subclassesDue(cls, classLevel, edition),
    ...(level > 20 && { problem: 'Already 20th level' }),
  };
}

/** The subclasses to pick from once the class reaches its subclass level. */
function subclassesDue(cls: Class, classLevel: number, edition: Edition): { id: string; name: string }[] {
  const options = originsFor(edition).classes.find((o) => o.id === cls.id);
  if (classLevel < (cls.subclassLevel ?? options?.subclassLevel ?? 3)) return [];
  return subclassesOf(cls, options?.subclasses ?? []);
}

function basePlan(level: number, classLevel: number, hitDie: number): ActorLevelPlan {
  return { level, classLevel, hitDie, average: averageHitDie(hitDie), improvement: false, subclasses: [] };
}

function subclassesOf(cls: Class, fromOrigins: { id: string; name: string }[]): { id: string; name: string }[] {
  const own = (cls.subclasses ?? []).map((s) => ({ id: s.id, name: s.name }));
  return [...own, ...fromOrigins.filter((o) => !own.some((s) => s.id === o.id))].map(({ id, name }) => ({ id, name }));
}

/** The actor's stats a level higher; throws an Error naming what the level doesn't allow. */
export function levelUpActor(stats: Stats, choice: ActorLevelChoice, content: Content, edition: Edition): Stats {
  const plan = actorLevelPlan(stats, choice.class, content, edition);
  if (plan.problem) throw new Error(plan.problem);
  const cls = findClass(choice.class, content)!;
  checkChoice(choice, plan, stats.abilities);
  const levels = classLevels({ stats }, content);
  const classes = levels.map((l) => ({
    class: l.cls?.id ?? l.id,
    level: l.level,
    ...(l.subclass && { subclass: l.subclass }),
  }));
  const at = classes.findIndex((c) => c.class === cls.id);
  const subclass = choice.subclass && { subclass: choice.subclass };
  if (at < 0) classes.push({ class: cls.id, level: 1, ...subclass });
  else classes[at] = { ...classes[at]!, level: classes[at]!.level + 1, ...subclass };
  const { class: _class, level: _level, ...rest } = stats;
  const abilities = raised(stats.abilities, choice.improvement);
  const maxHp = hitPoints(stats, choice, plan, levels.length ? classHp(levels, full(stats.abilities)) : undefined);
  return { ...rest, classes, ...(abilities && { abilities }), ...(maxHp !== undefined && { maxHp }) };
}

function checkChoice(choice: ActorLevelChoice, plan: ActorLevelPlan, abilities: Stats['abilities']): void {
  if (choice.hp !== 'average' && (choice.hp < 1 || choice.hp > plan.hitDie)) {
    throw new Error(`A d${plan.hitDie} can't roll ${choice.hp}`);
  }
  if (choice.subclass && !plan.subclasses.some((s) => s.id === choice.subclass)) {
    throw new Error(`No subclass "${choice.subclass}" to pick at this level`);
  }
  if (choice.improvement) checkImprovement(choice.improvement, plan, abilities);
}

function checkImprovement(
  by: Partial<Record<Ability, number>>,
  plan: ActorLevelPlan,
  abilities: Stats['abilities'],
): void {
  if (!plan.improvement) throw new Error('This level gives no ability score improvement');
  const points = Object.values(by);
  if (points.some((n) => n < 0) || points.reduce((a, b) => a + b, 0) !== 2) {
    throw new Error('An ability score improvement is 2 points');
  }
  const scores = full(abilities);
  if (ABILITIES.some((a) => scores[a] + (by[a] ?? 0) > 20)) throw new Error('That raises a score above 20');
}

const full = (abilities: Stats['abilities']): Abilities => AbilitiesSchema.parse({ ...abilities });

function raised(abilities: Stats['abilities'], by: ActorLevelChoice['improvement']): Stats['abilities'] {
  if (!by) return abilities;
  const scores = full(abilities);
  return AbilitiesSchema.parse(Object.fromEntries(ABILITIES.map((a) => [a, scores[a] + (by[a] ?? 0)])));
}

/** The new written maximum: the old one or (for a roll) the classes' average, plus this level's. */
function hitPoints(stats: Stats, choice: ActorLevelChoice, plan: ActorLevelPlan, derived?: number): number | undefined {
  if (stats.maxHp === undefined && choice.hp === 'average') return undefined;
  const base = stats.maxHp ?? derived ?? 0;
  const con = abilityMod(full(raised(stats.abilities, choice.improvement)).con);
  return base + Math.max(1, (choice.hp === 'average' ? plan.average : choice.hp) + con);
}

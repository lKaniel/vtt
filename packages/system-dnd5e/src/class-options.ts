import type { Content } from './content.ts';
import { characterLevel, type ClassLevel, classLevels } from './multiclass.ts';
import { ownFeatures } from './own-content.ts';
import type { Class, Feature, LevelTable } from './spell-schema.ts';
import type { Token } from './token-schema.ts';

// What a class gives beyond its own feature list: its subclass's features,
// the options picked among its choices ("<class>/<feature>" in
// `stats.features`) and the spells features always have prepared.

const valueAt = (table: LevelTable, level: number) => table.filter(([from]) => level >= from).at(-1)?.[1] ?? 0;

const subclassOf = (cls: Class | undefined, id: string | undefined) =>
  id ? cls?.subclasses?.find((s) => s.id === id) : undefined;

/** A class's features up to its level, its subclass's too; options of a choice only when picked (granted). */
export function levelFeatures(l: ClassLevel): Feature[] {
  const sub = subclassOf(l.cls, l.subclass);
  return [...(l.cls?.features ?? []), ...(sub?.features ?? [])].filter((f) => f.level <= l.level && !f.choice);
}

/** A class feature by "<class>/<feature>": the class's own, else one of its subclasses'. */
export function classFeature(ref: string, content: Content): Feature | undefined {
  const [id, feature] = ref.split('/');
  const cls = content.classes.get(id ?? '');
  const all = [...(cls?.features ?? []), ...(cls?.subclasses ?? []).flatMap((s) => s.features)];
  return all.find((f) => f.id === feature);
}

/** The features a token was granted on top of its class ("barbarian/rage"); unknown ones are left out. */
export function grantedFeatures(token: Token, content: Content): Feature[] {
  const fromClasses = (token.stats?.features ?? []).flatMap((ref) => {
    const found = classFeature(ref, content);
    return found ? [found] : [];
  });
  return [...fromClasses, ...ownFeatures(token)];
}

const spellsAt = (f: Feature, level: number) =>
  (f.grantsSpells ?? []).filter(([at]) => at <= level).map(([, id]) => id);

/** Spells the token's features always have prepared at its class levels: domain spells, a picked land's. */
export function featureSpellIds(token: Token, content: Content): string[] {
  const levels = classLevels(token, content);
  const fromClasses = levels.flatMap((l) => levelFeatures(l).flatMap((f) => spellsAt(f, l.level)));
  const total = characterLevel(token.stats) ?? 1;
  const picked = (token.stats?.features ?? []).flatMap((ref) => {
    const f = classFeature(ref, content);
    const level = levels.find((l) => l.id === ref.split('/')[0])?.level ?? total;
    return f ? spellsAt(f, level) : [];
  });
  return [...new Set([...fromClasses, ...picked])];
}

export interface ChoiceDue {
  id: string;
  name: string;
  /** How many the class level gives. */
  count: number;
  /** The option ids picked. */
  picked: string[];
  /** The options open at this level. */
  options: { id: string; name: string }[];
}

/** The class's choices at `level`, its subclass's too, with what `features` ("class/feature") picked of each. */
export function choicesDue(cls: Class, level: number, features: readonly string[], subclass?: string): ChoiceDue[] {
  const sub = subclassOf(cls, subclass);
  const parts = [cls, ...(sub ? [sub] : [])];
  return parts.flatMap((part) =>
    (part.choices ?? []).flatMap((c) => {
      const count = valueAt(c.count, level);
      if (!count) return [];
      const all = part.features.filter((f) => f.choice === c.id);
      const picked = all.filter((f) => features.includes(`${cls.id}/${f.id}`)).map((f) => f.id);
      const options = all.filter((f) => f.level <= level).map((f) => ({ id: f.id, name: f.name }));
      return [{ id: c.id, name: c.name, count, picked, options }];
    }),
  );
}

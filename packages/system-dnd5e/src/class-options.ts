import type { Content } from './content.ts';
import { characterLevel, type ClassLevel, classLevels } from './multiclass.ts';
import { ownFeatures } from './own-content.ts';
import { speciesFeatures } from './species-spells.ts';
import { countedPicks } from './spell-picks.ts';
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
  return [...fromClasses, ...ownFeatures(token), ...speciesFeatures(token, content.edition)];
}

const spellsAt = (f: Feature, level: number, picks: Picks = {}) => [
  ...(f.grantsSpells ?? []).filter(([at]) => at <= level).map(([, id]) => id),
  ...(f.freeCasts ?? []).map((c) => c.spell),
  ...(f.spellPicks ? countedPicks(f.spellPicks, level, picks.picked?.[f.id] ?? [], (id) => picks.spells?.get(id)) : []),
];

/** The spells picked for features (`stats.spellPicks`) and where to look them up. */
interface Picks {
  picked?: Readonly<Record<string, readonly string[]>>;
  spells?: Content['spells'];
}

/** Spells the token's features always have prepared at its class levels (domain spells, a picked land's), or cast free. */
export function featureSpellIds(token: Token, content: Content): string[] {
  const levels = classLevels(token, content);
  const picks = { picked: token.stats?.spellPicks, spells: content.spells };
  const fromClasses = levels.flatMap((l) => levelFeatures(l).flatMap((f) => spellsAt(f, l.level, picks)));
  const total = characterLevel(token.stats) ?? 1;
  const picked = (token.stats?.features ?? []).flatMap((ref) => {
    const f = classFeature(ref, content);
    const level = levels.find((l) => l.id === ref.split('/')[0])?.level ?? total;
    return f ? spellsAt(f, level, picks) : [];
  });
  const species = speciesFeatures(token, content.edition).flatMap((f) => spellsAt(f, total));
  return [...new Set([...fromClasses, ...picked, ...species])];
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

/** Picks of choice `id` the picked options add (focused fighting: one more focus art). */
function morePicks(cls: Class, id: string, features: readonly string[]): number {
  const picked = cls.features.filter((f) => f.morePicks?.of === id && features.includes(`${cls.id}/${f.id}`));
  return picked.reduce((n, f) => n + f.morePicks!.by, 0);
}

/** The class's choices at `level`, its subclass's too, with what `features` ("class/feature") picked of each. */
export function choicesDue(cls: Class, level: number, features: readonly string[], subclass?: string): ChoiceDue[] {
  const sub = subclassOf(cls, subclass);
  const parts = [cls, ...(sub ? [sub] : [])];
  return parts.flatMap((part) =>
    (part.choices ?? []).flatMap((c) => {
      const count = valueAt(c.count, level) + morePicks(cls, c.id, features);
      if (!count) return [];
      const all = part.features.filter((f) => f.choice === c.id);
      const picked = all.filter((f) => features.includes(`${cls.id}/${f.id}`)).map((f) => f.id);
      const options = all.filter((f) => f.level <= level).map((f) => ({ id: f.id, name: f.name }));
      return [{ id: c.id, name: c.name, count, picked, options }];
    }),
  );
}

/** The always-on effects of a token's class features (eternal watch's senses), for what it sees. */
export function classPassives(token: Token, content: Content): NonNullable<Feature['passive']>[] {
  const features = [...classLevels(token, content).flatMap(levelFeatures), ...grantedFeatures(token, content)];
  return features.flatMap((f) => (f.passive ? [f.passive] : []));
}

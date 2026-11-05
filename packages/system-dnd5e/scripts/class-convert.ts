// Turns the classes of the Open Character Format SRD packs into our class
// format: features by level, the options a character picks among (fighting
// styles, invocations, metamagic...) as features of a choice, and the
// subclasses with their own features and always-prepared spells.

import { bare, type Entry as PackEntry, type Pack, type PackChoice, type PackOption, str } from './srd-convert.ts';

/** A pack entry with the picks it asks for (class options, a subclass, skills). */
export type ClassEntry = PackEntry & { choices?: PackChoice[]; prerequisites?: { id: string; when?: unknown }[] };

type LevelTable = [number, number][];
interface Grant {
  item: string;
  when?: unknown;
}

const entryOf = (pack: Pack, ref: string): ClassEntry | undefined => pack.entries.get(ref);

interface Feature {
  id: string;
  name: string;
  level: number;
  description: string;
  choice?: string;
  grantsSpells?: [number, string][];
}

interface Choice {
  id: string;
  name: string;
  count: LevelTable;
}

/** Features and the choices among them, as a class or subclass lists them. */
interface Built {
  features: Feature[];
  choices: Choice[];
}

const last = (ref: string) => ref.split('.').at(-1)!;
const titleCase = (id: string) =>
  id.replace(/(^|-)(\w)/g, (_, dash: string, c: string) => `${dash ? ' ' : ''}${c.toUpperCase()}`);

/** The class level a `when` asks for ("self.level >= 3"); `fallback` when it asks none. */
function levelOf(when: unknown, fallback = 1): number {
  const found = typeof when === 'string' ? /self\.level >= (\d+)/.exec(when)?.[1] : undefined;
  return found ? Math.max(fallback, Number(found)) : fallback;
}

/** Drops steps that don't change the value. */
function squeeze(table: LevelTable): LevelTable {
  return table.filter(([, v], i) => i === 0 || v !== table[i - 1]![1]);
}

/** How many to pick by class level, from the pack's formula; one when it gives none. */
export function countTable(pick: unknown, from: number): LevelTable {
  if (typeof pick === 'number') return [[from, pick]];
  if (typeof pick !== 'string') return [[from, 1]];
  const list = /^\[([\d,\s]+)\]\[self\.level - 1\]$/.exec(pick.trim());
  if (list) {
    const values = list[1]!.split(',').map(Number);
    return squeeze(
      values.map((v, i) => [Math.max(from, i + 1), v] as [number, number]).filter(([l], i) => l === i + 1),
    );
  }
  const steps = [...pick.matchAll(/self\.level >= (\d+) \? (\d+)/g)].map(
    (m) => [Number(m[1]), Number(m[2])] as [number, number],
  );
  const base = /:\s*(\d+)\s*$/.exec(pick)?.[1];
  if (!steps.length || !base) return [[from, 1]];
  return squeeze([[from, Number(base)], ...steps.toReversed()]);
}

/** One more pick at each class level of a slot list ("self.level >= [1, 2, 2, 5][slot - 1]"). */
function slotTable(when: unknown, from: number): LevelTable | undefined {
  const list = typeof when === 'string' ? /\[([\d,\s]+)\]\[slot - 1\]/.exec(when)?.[1] : undefined;
  if (!list) return undefined;
  const levels = list.split(',').map(Number);
  const counts = [...new Set(levels)].map(
    (l) => [Math.max(from, l), levels.filter((x) => x <= l).length] as [number, number],
  );
  return squeeze(counts);
}

/** Spells granted by level, e.g. a domain's spells. */
function spellGrants(grants: ClassEntry['grants'], from: number): [number, string][] {
  return (grants ?? [])
    .filter((g) => g.item.startsWith('spells.'))
    .map((g) => [levelOf(g.when, from), bare(g.item)] as [number, string]);
}

const OPTION_TYPES = new Set([
  'fightingStyle',
  'invocation',
  'metamagic',
  'pactBoon',
  'hunterTactic',
  'draconicAncestry',
]);

interface Option {
  id: string;
  /** Where its name and description are in the pack's text. */
  text: string;
  entry?: ClassEntry;
  grants?: Grant[];
}

function ofTypeIn(pack: Pack, type: string, keep: (e: ClassEntry) => boolean): Option[] {
  return [...pack.entries.values()]
    .filter((e): e is ClassEntry => e.type === type && keep(e))
    .map((e) => ({ id: last(e.id), text: e.id, entry: e }));
}

/** A picked option that is itself a pick of fighting style feats (2024 paladins and rangers) is those feats. */
function inlineOptions(pack: Pack, options: PackOption[], textBase: string): Option[] {
  return options.flatMap((o) => {
    const feats = o.id === 'feat' ? o.choices?.[0] : undefined;
    if (feats) return optionsOf(pack, feats, `${textBase}.options.feat.choices.${feats.id}`) ?? [];
    return [{ id: o.id, text: `${textBase}.options.${o.id}`, grants: o.grants }];
  });
}

/** The options a choice picks among, or undefined when it isn't one the sheet keeps (skills, spells, feats...). */
function optionsOf(pack: Pack, c: PackChoice, textBase: string): Option[] | undefined {
  const from = c.from ?? {};
  if (from.type && OPTION_TYPES.has(from.type)) {
    const tactic = (e: ClassEntry) => from.type !== 'hunterTactic' || e.fields?.feature === c.id;
    return ofTypeIn(pack, from.type, tactic);
  }
  if (from.type === 'feat' && from.where?.includes('fighting-style')) {
    return ofTypeIn(pack, 'feat', (e) => e.fields?.category === 'fighting-style');
  }
  if (from.items) return from.items.map((ref) => ({ id: last(ref), text: ref, entry: entryOf(pack, ref) }));
  if (from.options) return inlineOptions(pack, from.options, textBase);
  return undefined;
}

/** The class level an option asks for, at least its choice's. */
function prerequisiteLevel(o: Option, from: number): number {
  const level = o.entry?.prerequisites?.find((p) => p.id === 'level');
  return levelOf(level?.when, from);
}

function optionFeature(pack: Pack, o: Option, choice: string, level: number): Feature {
  const at = prerequisiteLevel(o, level);
  const spells = spellGrants(o.grants ?? o.entry?.grants, at);
  return {
    id: o.id,
    name: pack.text[`${o.text}.name`] ?? titleCase(o.id),
    level: at,
    choice,
    description: pack.text[`${o.text}.description`] ?? '',
    ...(spells.length && { grantsSpells: spells }),
  };
}

/** "Choose a Hunter's Prey option" → "Hunter's Prey". */
function choiceName(pack: Pack, textBase: string, id: string): string {
  const prompt = pack.text[`${textBase}.prompt`];
  if (!prompt) return titleCase(id);
  const name = prompt.replace(/^Choose (an? )?/i, '').replace(/ options?$/i, '');
  // "Fighter fighting style" is the class's "Fighting Style".
  if (name.toLowerCase().endsWith(id.replace(/-/g, ' '))) return titleCase(id);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

interface Host {
  /** Where its text is: "classes.fighter", "features.warlock.eldritch-invocations". */
  ref: string;
  level: number;
  /** A feature hosting the choice names it; a class or subclass names it from the choice. */
  feature?: { id: string; name: string };
}

/** A choice a feature hosts takes the feature's id (with the choice's when it hosts several). */
function choiceId(host: Host, c: PackChoice, many: boolean): string {
  if (!host.feature) return c.id;
  return many ? `${host.feature.id}-${c.id}` : host.feature.id;
}

function choiceOf(pack: Pack, host: Host, c: PackChoice, many: boolean): Built {
  const textBase = `${host.ref}.choices.${c.id}`;
  const options = optionsOf(pack, c, textBase);
  if (!options?.length) return { features: [], choices: [] };
  const level = levelOf(c.when, host.level);
  const id = choiceId(host, c, many);
  const name = host.feature?.name ?? choiceName(pack, textBase, c.id);
  const count = slotTable(c.when, level) ?? countTable(c.pick, level);
  return {
    features: options.map((o) => optionFeature(pack, o, id, level)),
    choices: [{ id, name, count }],
  };
}

function choicesOf(pack: Pack, host: Host, list: PackChoice[] = []): Built {
  const kept = list.filter((c) => optionsOf(pack, c, `${host.ref}.choices.${c.id}`)?.length);
  return join(kept.map((c) => choiceOf(pack, host, c, kept.length > 1)));
}

function join(parts: Built[]): Built {
  return { features: parts.flatMap((p) => p.features), choices: parts.flatMap((p) => p.choices) };
}

/** A granted feature, the spells it always gives and the options it asks to pick. */
function featureOf(pack: Pack, ref: string, level: number): Built {
  const entry = entryOf(pack, ref);
  const spells = spellGrants(entry?.grants, level);
  const feature: Feature = {
    id: last(ref),
    name: pack.text[`${ref}.name`] ?? last(ref),
    level,
    description: pack.text[`${ref}.description`] ?? '',
    ...(spells.length && { grantsSpells: spells }),
  };
  const options = choicesOf(pack, { ref, level, feature }, entry?.choices);
  return { features: [feature, ...options.features], choices: options.choices };
}

const isFeature = (item: string) => item.startsWith('features.') && !item.includes('ability-score-improvement');

function grantedFeatures(pack: Pack, e: ClassEntry): Built {
  return join((e.grants ?? []).filter((g) => isFeature(g.item)).map((g) => featureOf(pack, g.item, levelOf(g.when))));
}

/** Option ids that clash with another feature of the class get their choice's id in front. */
function uniqueIds(features: Feature[]): Feature[] {
  return features.map((f, i) => {
    const clash = features.some((g, j) => j !== i && g.id === f.id && (j < i || !g.choice));
    return clash && f.choice ? { ...f, id: `${f.choice}-${f.id}` } : f;
  });
}

const byLevel = (a: Feature, b: Feature) => a.level - b.level;

/** A subclass's own spells, gathered into one feature. */
function subclassSpells(pack: Pack, sub: ClassEntry, name: string): Feature[] {
  const spells = spellGrants(sub.grants, 1);
  if (!spells.length) return [];
  return [
    {
      id: `${last(sub.id)}-spells`,
      name: `${name} Spells`,
      level: Math.min(...spells.map(([l]) => l)),
      description: 'Spells you always have prepared.',
      grantsSpells: spells,
    },
  ];
}

function convertSubclass(pack: Pack, sub: ClassEntry): object {
  const name = pack.text[`${sub.id}.name`] ?? titleCase(last(sub.id));
  const own = join([grantedFeatures(pack, sub), choicesOf(pack, { ref: sub.id, level: 1 }, sub.choices)]);
  const features = uniqueIds([...own.features, ...subclassSpells(pack, sub, name)]).sort(byLevel);
  return {
    id: last(sub.id),
    name,
    description: pack.text[`${sub.id}.description`] ?? '',
    features,
    ...(own.choices.length && { choices: own.choices }),
  };
}

function subclassesOf(pack: Pack, cls: ClassEntry): ClassEntry[] {
  return [...pack.entries.values()]
    .filter((e) => e.type === 'subclass' && e.fields?.class === cls.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function convertClass(pack: Pack, cls: ClassEntry): object {
  const key = bare(cls.id);
  const saves = (cls.effects ?? [])
    .filter((e) => e.target === 'proficiencies.saves')
    .map((e) => bare((e.value as { tag: string }).tag));
  const own = join([grantedFeatures(pack, cls), choicesOf(pack, { ref: cls.id, level: 1 }, cls.choices)]);
  const subclassPick = cls.choices?.find((c) => c.from?.type === 'subclass');
  const subclasses = subclassesOf(pack, cls).map((s) => convertSubclass(pack, s));
  return {
    id: key,
    name: pack.text[`classes.${key}.name`] ?? key,
    hitDie: Number(str(cls.fields?.hitDie)?.slice(2) ?? 8),
    saves,
    features: uniqueIds(own.features).sort(byLevel),
    ...(own.choices.length && { choices: own.choices }),
    ...(subclassPick && { subclassLevel: levelOf(subclassPick.when) }),
    ...(subclasses.length && { subclasses }),
  };
}

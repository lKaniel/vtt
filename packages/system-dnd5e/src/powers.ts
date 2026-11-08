import { evaluate } from './formula.ts';
import { levelNumber } from './pools.ts';
import type { OptionGroup, PowerOption } from './power-schema.ts';
import type { Feature, Spell } from './spell-schema.ts';

// Pool features (power-schema.ts) at work: a feature at its class level
// (upgrades, the options learned, "{mod}" and the damage multiplier filled
// in), what one use costs, and the spell it is aimed like with the picked
// options set over it.

type Fields = Record<string, unknown>;
const isObject = (v: unknown): v is Fields => !!v && typeof v === 'object' && !Array.isArray(v);

/** Effects added together: lists joined, everything else the later one's. */
export function addEffects(a: Fields | undefined, b: Fields | undefined): Fields | undefined {
  if (!a || !b) return a ?? b;
  const out: Fields = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const before = out[k];
    out[k] =
      Array.isArray(before) && Array.isArray(v) ? [...new Set([...(before as unknown[]), ...(v as unknown[])])] : v;
  }
  return out;
}

/** Spell fields with `set` over them; an `effect` is added to, not replaced. */
function setOver(spell: Fields | undefined, set: Fields | undefined): Fields | undefined {
  if (!set) return spell;
  const effect = addEffects(spell?.effect as Fields | undefined, set.effect as Fields | undefined);
  return { ...spell, ...set, ...(effect && { effect }) };
}

/** A feature with `set` over it; its `spell` is set over the feature's own. */
function upgraded(f: Feature, set: Fields): Feature {
  const spell = isObject(set.spell) ? setOver(f.spell, set.spell) : f.spell;
  return { ...f, ...set, ...(spell && { spell }) };
}

function optionAt(o: PowerOption, level: number): PowerOption {
  const ups = (o.upgrades ?? []).filter((u) => u.level <= level);
  if (!ups.length) return o;
  return { ...o, set: ups.reduce<Fields | undefined>((s, u) => setOver(s, u.set), o.set) };
}

export interface PowerLevel {
  /** The class level. */
  level: number;
  /** The pool ability's modifier, for "{mod}". */
  mod: number;
  /** Options learned early, as "<class>/<option>" (Discovery). */
  known: ReadonlySet<string>;
  cls: string;
}

function learned(group: OptionGroup, { level, known, cls }: PowerLevel): OptionGroup {
  const list = group.list.filter((o) => o.level <= level || known.has(`${cls}/${o.id}`));
  return { ...group, list: list.map((o) => optionAt(o, level)) };
}

const signed = (n: number) => {
  if (n === 0) return '';
  return n > 0 ? `+${n}` : String(n);
};

/** "{mod}" in spell text: "+{mod}" becomes the signed modifier (nothing for 0). */
function filled<T>(value: T, mod: number): T {
  const text = JSON.stringify(value)
    .replace(/\+\{mod\}/g, signed(mod))
    .replace(/\{mod\}/g, String(mod));
  return JSON.parse(text) as T;
}

/** A feature at its class level: upgrades in, options it knows, "{mod}" and its damage multiplier filled in. */
export function powerAt(f: Feature, at: PowerLevel): Feature {
  const up = (f.upgrades ?? []).filter((u) => u.level <= at.level).reduce((g, u) => upgraded(g, u.set), f);
  const mod = up.modFrom !== undefined && at.level < up.modFrom ? 0 : at.mod;
  const options = up.options?.map((g) => learned(g, at)).filter((g) => g.list.length);
  const times = up.times && levelNumber(up.times, at.level, 1);
  const spell = up.spell && { ...up.spell, ...(times !== undefined && { damageTimes: times }) };
  return filled({ ...up, ...(spell && { spell }), ...(options && { options }) }, mod);
}

/** A creature a use is aimed at, as costs see it. */
export interface CostTarget {
  weight: number;
  /** Linked to the user (affected by one of its Weaves). */
  linked?: boolean;
}

export interface PowerPick {
  /** Option ids picked, from any group. */
  picks: readonly string[];
  inputs: Readonly<Record<string, number>>;
  targets: readonly CostTarget[];
}

/** The picked options of each group; throws on an unknown option or a missing required pick. */
function pickedGroups(
  f: Pick<Feature, 'options' | 'name'>,
  picks: readonly string[],
): { group: OptionGroup; picked: PowerOption[] }[] {
  const groups = f.options ?? [];
  const all = groups.flatMap((g) => g.list.map((o) => o.id));
  const unknown = picks.find((p) => !all.includes(p));
  if (unknown) throw new Error(`${f.name} has no option called ${unknown} here`);
  return groups.map((group) => {
    const picked = group.list.filter((o) => picks.includes(o.id));
    if ((group.required || group.pick === 'one') && !picked.length) throw new Error(`Pick ${group.name} for ${f.name}`);
    if (group.pick === 'one' && picked.length > 1) throw new Error(`Pick one of ${group.name} for ${f.name}`);
    return { group, picked };
  });
}

const optionCost = (o: PowerOption, vars: Record<string, number>) =>
  typeof o.cost === 'number' ? o.cost : evaluate(o.cost, vars);

function inputValues(f: Pick<Feature, 'inputs'>, given: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries((f.inputs ?? []).map((i) => [i.id, Math.max(i.min, given[i.id] ?? i.default)]));
}

/** The cost of one target: the formula with its weight, the inputs and each group's picked costs. */
function targetCost(f: Feature, groups: ReturnType<typeof pickedGroups>, base: Record<string, number>, t: CostTarget) {
  const vars: Record<string, number> = { ...base, weight: t.weight, linked: t.linked ? 1 : 0 };
  for (const { group, picked } of groups) vars[group.id] = picked.reduce((n, o) => n + optionCost(o, vars), 0);
  const cost = evaluate(f.cost ?? '0', vars);
  return t.linked && f.linkedTimes !== undefined ? cost * f.linkedTimes : cost;
}

/** What one use costs: its formula for each target (once with weight 0 when it has none), added up. */
export function powerCost(f: Feature, pick: PowerPick, level = 1): number {
  const groups = pickedGroups(f, pick.picks);
  const inputs = inputValues(f, pick.inputs);
  const targets = pick.targets.length ? pick.targets : [{ weight: 0 }];
  return targets.reduce((n, t, i) => n + targetCost(f, groups, { ...inputs, level, first: i === 0 ? 1 : 0 }, t), 0);
}

/** The feature's spell fields with the picked options set over them, and their damage multipliers. */
export function pickedSpell(f: Pick<Feature, 'options' | 'spell' | 'name'>, picks: readonly string[]): Partial<Spell> {
  const picked = pickedGroups(f, picks).flatMap((g) => g.picked);
  const spell = picked.reduce<Fields>((s, o) => setOver(s, o.set) ?? s, { ...f.spell });
  const times = picked.reduce((n, o) => n * (o.times ?? 1), 1);
  if (times !== 1) spell.damageTimes = ((spell.damageTimes as number | undefined) ?? 1) * times;
  return spell;
}

/** Notes the GM still acts on for the picked options. */
export function pickedNotes(f: Pick<Feature, 'options'>, picks: readonly string[]): string[] {
  return (f.options ?? []).flatMap((g) =>
    g.list.filter((o) => picks.includes(o.id) && o.note).map((o) => `${o.name}: ${o.note}`),
  );
}

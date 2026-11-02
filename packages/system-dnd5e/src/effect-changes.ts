import { z } from 'zod';
import { ABILITIES, type Abilities, type DamageType, DamageTypeSchema } from './stats-schema.ts';

// Effect changes by key, as Foundry's Active Effects (and DAE) write them: an
// effect names a creature statistic, a mode and a value, and creature.ts folds
// every change into the sheet. Ability scores and proficiency change first, so
// what is worked out from them (attacks, saves, AC) follows.

/** Ability scores and proficiency: changed before anything is worked out from them. */
export const BASE_KEYS = [...ABILITIES.map((a) => `abilities.${a}` as const), 'proficiency'] as const;
/** Numbers on the finished sheet. */
export const SHEET_KEYS = [
  'ac',
  'maxHp',
  'speed',
  'initiative',
  'toHit',
  'saves.all',
  ...ABILITIES.map((a) => `saves.${a}` as const),
] as const;
/** Lists of damage types; a change adds its type. */
export const LIST_KEYS = ['resistances', 'immunities', 'vulnerabilities'] as const;
export const CHANGE_KEYS = [...BASE_KEYS, ...SHEET_KEYS, ...LIST_KEYS] as const;
export type ChangeKey = (typeof CHANGE_KEYS)[number];
export type ListKey = (typeof LIST_KEYS)[number];

/** The order changes apply in, as in Foundry: multiply, add, downgrade (at most), upgrade (at least), override. */
export const CHANGE_MODES = ['multiply', 'add', 'downgrade', 'upgrade', 'override'] as const;
export type ChangeMode = (typeof CHANGE_MODES)[number];

const isList = (key: string): key is ListKey => (LIST_KEYS as readonly string[]).includes(key);

/**
 * A value worked out from an ability of the effect's source, as Foundry's DAE
 * writes it: "@cha" is the Charisma modifier, "max(1,@cha)" at least 1. Auras
 * fill it in (auras.ts); elsewhere it counts for nothing.
 */
export const ABILITY_VALUE = /^(?:max\((-?\d+),\s*)?@(str|dex|con|int|wis|cha)\)?$/;
const isNumberish = (v: unknown) => typeof v === 'number' || (typeof v === 'string' && ABILITY_VALUE.test(v));

export const EffectChangeSchema = z
  .object({
    key: z.enum(CHANGE_KEYS),
    mode: z.enum(CHANGE_MODES).default('add'),
    value: z.union([z.number(), z.string()]),
  })
  .refine((c) => (isList(c.key) ? DamageTypeSchema.safeParse(c.value).success : isNumberish(c.value)), {
    message: 'damage lists take a damage type, the rest a number or an ability like "@cha" or "max(1,@cha)"',
    path: ['value'],
  });
export type EffectChange = z.infer<typeof EffectChangeSchema>;

const MODE_ORDER = (c: EffectChange) => CHANGE_MODES.indexOf(c.mode);

const FOLD: Record<ChangeMode, (n: number, v: number) => number> = {
  multiply: (n, v) => n * v,
  add: (n, v) => n + v,
  downgrade: (n, v) => Math.min(n, v),
  upgrade: (n, v) => Math.max(n, v),
  override: (_n, v) => v,
};

/** Folds numeric changes into a value, in mode order. */
export function applyNumberChanges(base: number, changes: readonly EffectChange[]): number {
  const sorted = [...changes].sort((a, b) => MODE_ORDER(a) - MODE_ORDER(b));
  return sorted.reduce((n, c) => (typeof c.value === 'number' ? FOLD[c.mode](n, c.value) : n), base);
}

interface Changing {
  changes?: readonly EffectChange[];
}

/** Every change the effects make to one key. */
export function changesTo(effects: readonly Changing[], key: ChangeKey): EffectChange[] {
  return effects.flatMap((e) => (e.changes ?? []).filter((c) => c.key === key));
}

/** A number after the effects' changes to its key. */
export function changed(base: number, effects: readonly Changing[], key: ChangeKey): number {
  const changes = changesTo(effects, key);
  return changes.length ? applyNumberChanges(base, changes) : base;
}

/** Ability scores (kept between 1 and 30) and proficiency after the effects' changes. */
export function changedBase(
  abilities: Abilities,
  proficiency: number,
  effects: readonly Changing[],
): { abilities: Abilities; proficiency: number } {
  const scores = Object.fromEntries(
    ABILITIES.map((a) => [a, Math.min(30, Math.max(1, Math.round(changed(abilities[a], effects, `abilities.${a}`))))]),
  ) as Abilities;
  return { abilities: scores, proficiency: changed(proficiency, effects, 'proficiency') };
}

/** A damage type list with the types the effects add. */
export function changedList(list: readonly DamageType[], effects: readonly Changing[], key: ListKey): DamageType[] {
  const added = changesTo(effects, key).map((c) => c.value as DamageType);
  return [...new Set([...list, ...added])];
}

const LIST_WORDS: Record<ListKey, string> = {
  resistances: 'Resists',
  immunities: 'Immune to',
  vulnerabilities: 'Vulnerable to',
};

/** A key's name on a sheet: "STR", "AC", "DEX save", "All saves". */
export function keyName(key: ChangeKey): string {
  const [head, tail] = key.split('.') as [string, string | undefined];
  if (head === 'abilities') return tail!.toUpperCase();
  if (head === 'saves') return tail === 'all' ? 'All saves' : `${tail!.toUpperCase()} save`;
  const names: Record<string, string> = {
    ac: 'AC',
    maxHp: 'Max HP',
    toHit: 'Attack rolls',
    proficiency: 'Proficiency',
    speed: 'Speed',
    initiative: 'Initiative',
  };
  return names[head] ?? LIST_WORDS[head as ListKey];
}

const MODE_TEXT: Record<ChangeMode, (v: number) => string> = {
  add: (v) => (v < 0 ? `${v}` : `+${v}`),
  multiply: (v) => `×${v}`,
  override: (v) => `= ${v}`,
  upgrade: (v) => `at least ${v}`,
  downgrade: (v) => `at most ${v}`,
};

/** What a change does, in a few words: "STR = 19", "AC +1", "Resists fire". */
export function changeText(c: EffectChange): string {
  if (isList(c.key)) return `${LIST_WORDS[c.key]} ${c.value}`;
  return `${keyName(c.key)} ${MODE_TEXT[c.mode](Number(c.value))}`;
}

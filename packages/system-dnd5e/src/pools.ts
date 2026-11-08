import { abilityMod } from './creature-math.ts';
import type { Hold, LevelNumbers, Pool, Weight } from './power-schema.ts';
import type { Abilities, Ability } from './stats-schema.ts';
import type { Token } from './token-schema.ts';
import { characterLevel, type ClassLevel } from './multiclass.ts';

// A homebrew class's point pool (an illusionist's Lucidity): its size at the
// class level, what's spent since the last rest, the lasting uses it holds
// (`token.holds`), and the weights feature costs are counted in.

/** The value for the highest level in the table `level` has reached; `before` until the first. */
export function levelNumber(
  table: LevelNumbers | readonly (readonly [number, number])[],
  level: number,
  before = 0,
): number {
  let value = before;
  for (const [from, v] of table) if (level >= from) value = v;
  return value;
}

/** How heavy a creature of this rank (challenge rating or character level) and these scores is for costs. */
export function weightOf(def: Weight, rank: number, abilities: Abilities): number {
  const tier = levelNumber(def.tiers, rank, def.tiers[0]![1]);
  const mod = def.ability ? abilityMod(abilities[def.ability]) : 0;
  return tier * Math.max(def.min, def.base + def.per * mod);
}

export interface PoolSheet {
  id: string;
  name: string;
  ability: Ability;
  /** The maximum after reserved uses come off it. */
  max: number;
  left: number;
  /** Points reserved uses take off the maximums (Glamours). */
  reserved: number;
  /** What held uses may cost at once, and what they hold now. */
  concurrent?: { max: number; held: number };
  weight?: Weight;
  /** The class's feature DC, attack bonus and ability modifier. */
  dc: number;
  attack: number;
  mod: number;
  recharge: Pool['recharge'];
}

const sum = (holds: readonly Hold[]) => holds.reduce((n, h) => n + h.cost, 0);

/** The pool as the sheet shows it, for a class at `level`. */
export function poolSheet(
  token: Pick<Token, 'spent' | 'holds'>,
  { pool, level }: { pool: Pool; level: number },
  { abilities, proficiency }: { abilities: Abilities; proficiency: number },
): PoolSheet {
  const full = levelNumber(pool.max, level);
  const holds = token.holds ?? [];
  const reserved = sum(holds.filter((h) => h.reserve)) * levelNumber(pool.reserveTimes ?? [], level, 1);
  const max = Math.max(0, full - reserved);
  const left = Math.max(0, Math.min(max, full - (token.spent?.pool ?? 0)));
  const mod = abilityMod(abilities[pool.ability]);
  const concurrent = pool.concurrent !== undefined && {
    concurrent: { max: Math.max(0, full * pool.concurrent - reserved), held: sum(holds.filter((h) => !h.reserve)) },
  };
  return {
    id: pool.id,
    name: pool.name,
    ability: pool.ability,
    max,
    left,
    reserved,
    ...concurrent,
    ...(pool.weight && { weight: pool.weight }),
    dc: 8 + proficiency + mod,
    attack: proficiency + mod,
    mod,
    recharge: pool.recharge,
  };
}

/** What's left to spend, and what held uses may still hold (Infinity without a concurrent share). */
export function poolLeft(sheet: Pick<PoolSheet, 'left' | 'concurrent'> & Partial<PoolSheet>): {
  pool: number;
  held: number;
} {
  const c = sheet.concurrent;
  return { pool: sheet.left, held: c ? Math.max(0, c.max - c.held) : Infinity };
}

export function spendPool<T extends Pick<Token, 'spent'>>(token: T, amount: number): T {
  if (amount <= 0) return token;
  return { ...token, spent: { ...token.spent, pool: (token.spent?.pool ?? 0) + amount } };
}

export function addHold<T extends Pick<Token, 'holds'>>(token: T, hold: Hold): T {
  return { ...token, holds: [...(token.holds ?? []).filter((h) => h.id !== hold.id), hold] };
}

export function releaseHold<T extends Pick<Token, 'holds'>>(token: T, id: string): T {
  const holds = (token.holds ?? []).filter((h) => h.id !== id);
  return { ...token, holds: holds.length ? holds : undefined };
}

/** The pool after a rest: full again when the pool comes back on that kind of rest. */
export function restPool<T extends Pick<Token, 'spent'>>(
  token: T,
  pool: Pick<Pool, 'recharge'>,
  kind: 'short' | 'long',
): T {
  if (token.spent?.pool === undefined || (kind === 'short' && pool.recharge === 'long')) return token;
  const { pool: _spent, ...rest } = token.spent;
  return { ...token, spent: Object.keys(rest).length ? rest : undefined };
}

/** A creature's pool (the first of its classes with one) and its rank (challenge rating or character level). */
export function poolParts(
  token: Pick<Token, 'spent' | 'holds' | 'stats'>,
  levels: readonly ClassLevel[],
  basics: { abilities: Abilities; proficiency: number },
  monster: { cr: number } | undefined,
): { pool?: PoolSheet; rank: number } {
  const rank = monster?.cr ?? characterLevel(token.stats) ?? 0;
  const l = levels.find((c) => c.cls?.pool);
  return l ? { pool: poolSheet(token, { pool: l.cls!.pool!, level: l.level }, basics), rank } : { rank };
}

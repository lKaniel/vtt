import type { Creature } from './creature.ts';
import type { FeatureSheet } from './classes.ts';
import { spendUse } from './features.ts';
import { evaluate } from './formula.ts';
import { spendPool } from './pools.ts';
import type { Spell } from './spell-schema.ts';
import type { Token } from './token-schema.ts';

// Casting a spell with a feature instead of a slot (Feature `freeCasts`): a
// 2024 ranger's free hunter's marks, an invocation's at-will spell, a
// druid's wild companion paid with a use of wild shape. A homebrew class's
// feature may pay with points from the class's pool instead (`cost`), so
// its points cast spells like slots.

/**
 * A feature that can pay for a cast: the level it casts at, on yourself only,
 * and its uses left (none: at will), or the points it costs from `pool`.
 */
export interface FeatureCast {
  feature: string;
  name: string;
  level: number;
  self: boolean;
  left?: number;
  max?: number;
  cost?: number;
  pool?: string;
}

type Payer = Pick<Creature, 'features'> & Partial<Pick<Creature, 'pool'>>;

const castOf = (f: Pick<FeatureSheet, 'freeCasts'>, spell: string) => f.freeCasts?.find((c) => c.spell === spell);

function featureCast(sheet: Payer, f: FeatureSheet, spell: Pick<Spell, 'id' | 'level'>): FeatureCast | undefined {
  const cast = castOf(f, spell.id);
  if (!cast) return undefined;
  const level = Math.max(spell.level, cast.level ?? spell.level);
  const paid = { feature: f.id, name: f.name, level, self: !!cast.self };
  if (cast.cost !== undefined) return { ...paid, cost: evaluate(cast.cost, { level }), pool: sheet.pool?.name ?? '' };
  return { ...paid, ...(f.max !== undefined && { left: f.left ?? 0, max: f.max }) };
}

/** The features of `sheet` that can cast `spell` without a slot, spent ones too (with `left` 0). */
export function featureCasts(sheet: Payer, spell: Pick<Spell, 'id' | 'level'>): FeatureCast[] {
  return sheet.features.flatMap((f) => featureCast(sheet, f, spell) ?? []);
}

/** Whether `cast` can pay now: a use left (or none needed), or points enough in the pool. */
export function canPay(sheet: Partial<Pick<Creature, 'pool'>> | undefined, cast: FeatureCast): boolean {
  if (cast.cost === undefined) return cast.left !== 0;
  return (sheet?.pool?.left ?? 0) >= cast.cost;
}

/** Why the pool can't pay `cost` for `spell`, or undefined if it can. */
function poolProblem(sheet: Payer, spell: Pick<Spell, 'name'>, cost: number): string | undefined {
  const pool = sheet.pool;
  if (!pool) return `has no pool to pay for ${spell.name}`;
  if (pool.left < cost) return `has only ${pool.left} ${pool.name} left; ${spell.name} costs ${cost}`;
  return undefined;
}

/** Why `sheet` can't cast `spell` with feature `id` now, or undefined if it can. */
export function featureCastProblem(
  sheet: Payer,
  spell: Pick<Spell, 'id' | 'level' | 'name'>,
  id: string,
  { fighting = false }: { fighting?: boolean } = {},
): string | undefined {
  const feature = sheet.features.find((f) => f.id === id);
  if (!feature) return "doesn't have that feature";
  const cast = castOf(feature, spell.id);
  if (!cast) return `can't cast ${spell.name} with ${feature.name}`;
  if (cast.beforeCombat && fighting) return `casts ${spell.name} before the fight, not during it`;
  const cost = featureCast(sheet, feature, spell)?.cost;
  if (cost !== undefined) return poolProblem(sheet, spell, cost);
  if (feature.left === 0) return `has no uses left of ${feature.name}`;
  return undefined;
}

/** `token` after paying for a cast with a feature: its pool points, one of its uses, or nothing for an at-will one. */
export function payWithFeature(token: Token, sheet: Payer, paid: Pick<FeatureCast, 'feature' | 'cost'>): Token {
  if (paid.cost !== undefined) return spendPool(token, paid.cost);
  const feature = sheet.features.find((f) => f.id === paid.feature);
  return feature ? spendUse(token, feature) : token;
}

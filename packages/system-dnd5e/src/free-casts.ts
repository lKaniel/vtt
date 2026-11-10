import type { Creature } from './creature.ts';
import type { FeatureSheet } from './classes.ts';
import { spendUse } from './features.ts';
import type { Spell } from './spell-schema.ts';
import type { Token } from './token-schema.ts';

// Casting a spell with a feature instead of a slot (Feature `freeCasts`): a
// 2024 ranger's free hunter's marks, an invocation's at-will spell, a
// druid's wild companion paid with a use of wild shape.

/** A feature that can pay for a cast: the level it casts at, on yourself only, and its uses left (none: at will). */
export interface FeatureCast {
  feature: string;
  name: string;
  level: number;
  self: boolean;
  left?: number;
  max?: number;
}

const castOf = (f: Pick<FeatureSheet, 'freeCasts'>, spell: string) => f.freeCasts?.find((c) => c.spell === spell);

function featureCast(f: FeatureSheet, spell: Pick<Spell, 'id' | 'level'>): FeatureCast | undefined {
  const cast = castOf(f, spell.id);
  if (!cast) return undefined;
  const uses = f.max === undefined ? {} : { left: f.left ?? 0, max: f.max };
  const level = Math.max(spell.level, cast.level ?? spell.level);
  return { feature: f.id, name: f.name, level, self: !!cast.self, ...uses };
}

/** The features of `sheet` that can cast `spell` without a slot, spent ones too (with `left` 0). */
export function featureCasts(sheet: Pick<Creature, 'features'>, spell: Pick<Spell, 'id' | 'level'>): FeatureCast[] {
  return sheet.features.flatMap((f) => featureCast(f, spell) ?? []);
}

/** Why `sheet` can't cast `spell` with feature `id` now, or undefined if it can. */
export function featureCastProblem(
  sheet: Pick<Creature, 'features'>,
  spell: Pick<Spell, 'id' | 'level' | 'name'>,
  id: string,
): string | undefined {
  const feature = sheet.features.find((f) => f.id === id);
  if (!feature) return "doesn't have that feature";
  if (!castOf(feature, spell.id)) return `can't cast ${spell.name} with ${feature.name}`;
  if (feature.left === 0) return `has no uses left of ${feature.name}`;
  return undefined;
}

/** `token` after paying for a cast with feature `id`: one of its uses, or nothing for an at-will one. */
export function payWithFeature(token: Token, sheet: Pick<Creature, 'features'>, id: string): Token {
  const feature = sheet.features.find((f) => f.id === id);
  return feature ? spendUse(token, feature) : token;
}

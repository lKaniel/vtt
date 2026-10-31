import type { FeatureSheet } from './classes.ts';
import { levelValue } from './classes.ts';
import type { Creature } from './creature.ts';
import { roll, type Rng } from './dice.ts';
import { removeEffects, rollSave, type SaveRoll } from './effects.ts';
import type { Token } from './schema.ts';
import type { Effect } from './spell-schema.ts';

// Using class features (second wind, action surge, rage), resting, and the
// saves creatures repeat at the end of their turns.

/** Why `sheet` can't use the feature now, or undefined if it can. */
export function featureProblem(sheet: Creature, id: string): string | undefined {
  const feature = sheet.features.find((f) => f.id === id);
  if (!feature?.action) return "doesn't have that feature";
  if (feature.left === 0) return `has no uses left of ${feature.name}`;
  return undefined;
}

export interface FeatureUse {
  token: Token;
  feature: FeatureSheet;
  healed?: number;
  effect?: Effect;
  /** The creature gets its action back (action surge). */
  grantAction?: boolean;
}

function spendUse(token: Token, feature: FeatureSheet): Token {
  if (feature.max === undefined) return token;
  const uses = { ...token.spent?.uses, [feature.id]: (token.spent?.uses?.[feature.id] ?? 0) + 1 };
  return { ...token, spent: { ...token.spent, uses } };
}

function featureEffect(token: Token, feature: FeatureSheet): Effect | undefined {
  if (!feature.effect) return undefined;
  const level = token.stats?.level ?? 1;
  const meleeDamage = feature.meleeDamage ? levelValue(feature.meleeDamage, level) : feature.effect.meleeDamage;
  return {
    ...feature.effect,
    id: `${feature.id}-${token.id}`,
    name: feature.effect.name ?? feature.name,
    source: token.id,
    meleeDamage,
  };
}

/** Uses a feature: spends a use, then heals, adds its effect or gives back the action. Check `featureProblem` first. */
export function useFeature(token: Token, sheet: Creature, id: string, rng: Rng = Math.random): FeatureUse {
  const feature = sheet.features.find((f) => f.id === id)!;
  let next = spendUse(token, feature);
  let healed: number | undefined;
  if (feature.heal) {
    const amount = roll(feature.heal.replace(/level/g, String(token.stats?.level ?? 1)), rng).total;
    const hp = Math.min(sheet.maxHp, sheet.hp + amount);
    healed = hp - sheet.hp;
    next = { ...next, hp: hp >= sheet.maxHp ? undefined : hp };
  }
  const effect = featureEffect(token, feature);
  if (effect) next = { ...next, effects: [...(next.effects ?? []).filter((e) => e.id !== effect.id), effect] };
  return { token: next, feature, healed, effect, grantAction: feature.grantAction };
}

function restUses(token: Token, sheet: Creature): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const f of sheet.features) {
    const spent = token.spent?.uses?.[f.id] ?? 0;
    if (f.recharge === 'short-one' && spent > 1) out[f.id] = spent - 1;
    else if (f.recharge === 'long' && spent > 0) out[f.id] = spent;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A short rest gives back short-rest features and pact slots; a long rest gives back everything. */
export function rest(token: Token, sheet: Creature, kind: 'short' | 'long'): Token {
  if (kind === 'long')
    return { ...token, hp: undefined, spent: undefined, effects: undefined, concentration: undefined };
  const uses = restUses(token, sheet);
  const slots = sheet.caster?.pact ? undefined : token.spent?.slots;
  return { ...token, spent: uses || slots ? { slots, uses } : undefined };
}

/** Repeats the saves of effects like hold person; those saved against end. */
export function endOfTurnSaves(
  token: Token,
  sheet: Creature,
  rng: Rng = Math.random,
): { token: Token; saves: { effect: string; save: SaveRoll }[] } {
  const saves = (token.effects ?? [])
    .filter((e) => e.repeatSave && e.save)
    .map((e) => ({ id: e.id, effect: e.name, save: rollSave(sheet, e.save!.ability, e.save!.dc, rng) }));
  const ended = new Set(saves.filter((s) => s.save.success).map((s) => s.id));
  return { token: removeEffects(token, ended), saves: saves.map(({ effect, save }) => ({ effect, save })) };
}

import type { FeatureSheet } from './classes.ts';
import { levelValue } from './classes.ts';
import type { Creature } from './creature.ts';
import { roll, type Rng } from './dice.ts';
import { removeEffects, rollSave, type SaveRoll } from './effects.ts';
import type { Token } from './schema.ts';
import { SpellSchema, type Effect, type Spell } from './spell-schema.ts';

// Using class features (second wind, action surge, rage), resting, and the
// saves creatures repeat at the end of their turns.

/** The spell a feature is aimed like (bardic inspiration, turn undead), cast with its action. */
export function featureSpell(feature: FeatureSheet): Spell {
  return SpellSchema.parse({
    id: feature.id,
    name: feature.name,
    level: 0,
    school: 'feature',
    castingTime: feature.action === 'bonus' ? 'bonus' : 'action',
    range: 0,
    description: feature.description,
    ...feature.spell,
  });
}

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
  /** Feet of extra movement (dash). */
  dash?: number;
  /** Extra attacks this turn (flurry of blows). */
  grantAttacks?: number;
}

export function spendUse(token: Token, feature: FeatureSheet, amount = 1): Token {
  if (feature.max === undefined) return token;
  const id = feature.usesFrom ?? feature.id;
  const uses = { ...token.spent?.uses, [id]: (token.spent?.uses?.[id] ?? 0) + amount };
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
  return {
    token: next,
    feature,
    healed,
    effect,
    grantAction: feature.grantAction,
    dash: feature.dash ? sheet.speed : undefined,
    grantAttacks: feature.grantAttacks,
  };
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

/** A failed repeated save makes some effects worse instead of keeping them as they are. */
function worsen(effect: Effect): Effect {
  return { ...effect, conditions: effect.worsens, worsens: undefined, repeatSave: undefined };
}

/** Repeats the saves of effects like hold person; those saved against end, and some failed ones get worse. */
export function endOfTurnSaves(
  token: Token,
  sheet: Creature,
  rng: Rng = Math.random,
): { token: Token; saves: { effect: string; save: SaveRoll; worse?: boolean }[] } {
  const saves = (token.effects ?? [])
    .filter((e) => e.repeatSave && e.save)
    .map((e) => ({ e, save: rollSave(sheet, e.save!.ability, e.save!.dc, rng) }));
  const ended = new Set(saves.filter((s) => s.save.success).map((s) => s.e.id));
  const worse = new Set(saves.filter((s) => !s.save.success && s.e.worsens).map((s) => s.e.id));
  const kept = removeEffects(token, ended);
  const effects = kept.effects?.map((e) => (worse.has(e.id) ? worsen(e) : e));
  return {
    token: worse.size ? { ...kept, effects } : kept,
    saves: saves.map(({ e, save }) => ({ effect: e.name, save, ...(worse.has(e.id) && { worse: true }) })),
  };
}

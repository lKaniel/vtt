import { type FeatureSheet, levelValue } from './classes.ts';
import { keptResistance } from './legendary.ts';
import { characterLevel } from './multiclass.ts';
import type { Creature } from './creature.ts';
import { hitDiceOf, restedExhaustion, restedHitDice } from './vigour.ts';
import { type Rng, roll } from '@vtt/shared';
import { gainMomentum, momentumForSpend, spendMomentum } from './momentum.ts';
import { actionFinisher } from './finishers.ts';
import { removeEffects, rollSave, type SaveRoll } from './effects.ts';
import type { Token } from './token-schema.ts';
import { type Effect, type Spell, SpellSchema } from './spell-schema.ts';

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

/** Spends uses; with the sheet, points of a momentum pool's source build momentum dice. A finisher spends every die. */
export function spendUse(token: Token, feature: FeatureSheet, amount = 1, sheet?: Creature): Token {
  if (feature.max === undefined) return token;
  if (feature.finisher) return spendMomentum(token);
  const id = feature.usesFrom ?? feature.id;
  const uses = { ...token.spent?.uses, [id]: (token.spent?.uses?.[id] ?? 0) + amount };
  const spent = { ...token, spent: { ...token.spent, uses } };
  return sheet ? gainMomentum(spent, sheet, momentumForSpend(sheet, feature, amount)) : spent;
}

/** The level a feature's tables read: its class's level. */
const featureLevel = (token: Token, feature: FeatureSheet): number =>
  feature.classLevel ?? characterLevel(token.stats) ?? 1;

function featureEffect(token: Token, feature: FeatureSheet): Effect | undefined {
  if (!feature.effect) return undefined;
  const level = featureLevel(token, feature);
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
  const finish = actionFinisher(feature, { token, sheet });
  let next = spendUse(token, feature, 1, sheet);
  if (feature.grantsMomentum) next = gainMomentum(next, sheet, feature.grantsMomentum);
  const { token: healedToken, healed } = healFrom(next, sheet, feature, rng);
  next = healedToken;
  const effect = featureEffect(token, feature) ?? finish.effect;
  if (effect) next = { ...next, effects: [...(next.effects ?? []).filter((e) => e.id !== effect.id), effect] };
  return {
    token: next,
    feature,
    healed,
    effect,
    grantAction: feature.grantAction,
    dash: finish.dash ?? dashOf(feature, sheet.speed),
    grantAttacks: finish.grantAttacks ?? feature.grantAttacks,
  };
}

/** The hit points a healing feature gives back (second wind). */
function healFrom(token: Token, sheet: Creature, feature: FeatureSheet, rng: Rng): { token: Token; healed?: number } {
  if (!feature.heal) return { token };
  const amount = roll(feature.heal.replace(/level/g, String(featureLevel(token, feature))), rng).total;
  const hp = Math.min(sheet.maxHp, sheet.hp + amount);
  return { token: { ...token, hp: hp >= sheet.maxHp ? undefined : hp }, healed: hp - sheet.hp };
}

/** Feet of extra movement a feature gives: the creature's speed (dash) or half of it (hunter's pursuit). */
function dashOf(feature: FeatureSheet, speed: number): number | undefined {
  if (feature.dash) return speed;
  return feature.halfDash ? Math.floor(speed / 2) : undefined;
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

function withResistance(uses: Record<string, number> | undefined, token: Token): Record<string, number> | undefined {
  const all = { ...uses, ...keptResistance(token) };
  return Object.keys(all).length ? all : undefined;
}

/** A short rest gives back short-rest features and pact slots; a long rest gives back everything. */
export function rest(token: Token, sheet: Creature, kind: 'short' | 'long'): Token {
  if (kind === 'long') return longRest(token, sheet);
  const uses = withResistance(restUses(token, sheet), token);
  const slots = shortRestSlots(token.spent?.slots, sheet.caster);
  const hitDice = token.spent?.hitDice;
  const pool = sheet.pool?.recharge === 'long' ? token.spent?.pool : undefined;
  const spent = uses || slots || hitDice || pool ? { slots, uses, hitDice, pool } : undefined;
  return { ...token, spent, momentum: undefined };
}

/** Spent slots after a short rest: pact slots come back (taken to be the ones spent first). */
function shortRestSlots(spent: number[] | undefined, caster: Creature['caster']): number[] | undefined {
  if (!spent || caster?.pact) return undefined;
  const pact = caster?.pactSlots;
  if (!pact) return spent;
  const left = spent.map((n, i) => Math.max(0, n - (pact[i] ?? 0)));
  return left.some((n) => n > 0) ? left : undefined;
}

/** Reserved pool uses (Glamours) last through a long rest, and the effects that keep them. */
function keptReserves(token: Token): Pick<Token, 'effects' | 'holds'> {
  const holds = token.holds?.filter((h) => h.reserve);
  const ids = new Set(holds?.map((h) => h.id));
  const effects = token.effects?.filter((e) => e.hold !== undefined && ids.has(e.hold));
  return { effects: effects?.length ? effects : undefined, holds: holds?.length ? holds : undefined };
}

/** Everything back, but only some hit dice (2014) and one level of exhaustion. */
function longRest(token: Token, sheet: Creature): Token {
  const total = hitDiceOf(token, sheet)?.total ?? 0;
  const hitDice = restedHitDice(token.spent?.hitDice, total, sheet.edition);
  const exhaustion = restedExhaustion(token.exhaustion);
  return {
    ...token,
    hp: undefined,
    spent: hitDice ? { hitDice } : undefined,
    ...keptReserves(token),
    concentration: undefined,
    momentum: undefined,
    exhaustion,
  };
}

/** A failed repeated save makes some effects worse instead of keeping them as they are. */
function worsen(effect: Effect): Effect {
  return { ...effect, conditions: effect.worsens, worsens: undefined, repeatSave: undefined };
}

/** An effect after its bearer's repeated save: gone (undefined), worse, or tallied. */
function afterSave(e: Effect, success: boolean): { effect?: Effect; worse?: boolean } {
  if (!e.threeTimes) {
    if (success) return {};
    return e.worsens ? { effect: worsen(e), worse: true } : { effect: e };
  }
  const tally = {
    saved: (e.tally?.saved ?? 0) + (success ? 1 : 0),
    failed: (e.tally?.failed ?? 0) + (success ? 0 : 1),
  };
  if (tally.saved >= 3) return {};
  if (tally.failed >= 3) return { effect: { ...worsen(e), threeTimes: undefined, tally: undefined }, worse: true };
  return { effect: { ...e, tally } };
}

/** Repeats the saves of effects like hold person; those saved against end, and some failed ones get worse. */
export function endOfTurnSaves(
  token: Token,
  sheet: Creature,
  rng: Rng = Math.random,
): { token: Token; saves: { effect: string; save: SaveRoll; worse?: boolean }[] } {
  const saves = (token.effects ?? [])
    .filter((e) => e.repeatSave && e.save)
    .map((e) => {
      const save = rollSave(sheet, e.save!.ability, e.save!.dc, rng);
      return { e, save, ...afterSave(e, save.success) };
    });
  const kept = removeEffects(token, new Set(saves.filter((s) => !s.effect).map((s) => s.e.id)));
  const changed = new Map(saves.flatMap((s) => (s.effect && s.effect !== s.e ? [[s.e.id, s.effect] as const] : [])));
  const effects = kept.effects?.map((e) => changed.get(e.id) ?? e);
  return {
    token: changed.size ? { ...kept, effects } : kept,
    saves: saves.map(({ e, save, worse }) => ({ effect: e.name, save, ...(worse && { worse: true }) })),
  };
}

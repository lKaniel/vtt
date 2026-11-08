import type { AttackRoll } from './attack.ts';
import type { FeatureSheet } from './classes.ts';
import type { Creature } from './creature.ts';
import { canReact } from './effects.ts';
import { weightFor } from './power-casts.ts';
import { powerCost } from './powers.ts';
import type { Effect } from './spell-schema.ts';
import type { CastResult, CastSide } from './spells.ts';

// Pool reactions (power-schema.ts `reaction`): fooling an attacker about
// where you are as its attack is about to hit (Misdirection's Veil, Redirect,
// Unreal Self), and stepping out of a spell's way (Phantom Step).

export interface PoolReaction {
  feature: FeatureSheet;
  /** Paid when it's taken: its own cost, or what it builds on. */
  cost: number;
  /** Paid on top when it works (a redirect that lands, a hit negated). */
  extra: number;
}

/** Whether an attacker's mind can be fooled about where you stand: it has one, and no blindsight or truesight. */
export function fooled(attacker: Pick<Creature, 'abilities' | 'senses'>): boolean {
  return attacker.abilities.int > 2 && !attacker.senses?.blindsight && !attacker.senses?.truesight;
}

const costFor = (feature: FeatureSheet, reactor: Creature, other: Creature) =>
  powerCost(
    feature,
    { picks: [], inputs: {}, targets: [{ weight: weightFor(reactor, other) }] },
    feature.classLevel ?? 1,
  );

/** The pool reactions `reactor` may take now against `other` (an attacker, a caster), and what each costs. */
export function poolReactions(reactor: CastSide, other: CastSide, when: 'hit' | 'save'): PoolReaction[] {
  const { sheet } = reactor;
  const pool = sheet.pool;
  if (!pool || sheet.hp <= 0 || !canReact(sheet)) return [];
  if (when === 'hit' && !fooled(other.sheet)) return [];
  return sheet.features.flatMap((feature) => {
    if (feature.reaction?.when !== when) return [];
    const base = feature.reaction.with ? sheet.features.find((f) => f.id === feature.reaction!.with) : undefined;
    if (feature.reaction.with && !base) return [];
    const own = costFor(feature, sheet, other.sheet);
    const cost = base ? costFor(base, sheet, other.sheet) : own;
    const extra = base ? own : 0;
    return cost + extra <= pool.left ? [{ feature, cost, extra }] : [];
  });
}

/** The attack after a veil: rolled again with `second`, the lower d20 kept, against `ac`. */
export function veiled(roll: AttackRoll, second: number, ac: number): AttackRoll {
  const natural = Math.min(roll.natural, second);
  const total = roll.total - roll.natural + natural;
  const hit = natural === 20 || (natural !== 1 && total >= ac);
  return { ...roll, natural, total, hit, crit: roll.crit && natural === roll.natural, damage: hit ? roll.damage : [] };
}

/** Damage after stepping out of a spell's way: none on a successful save, half on a failed one. */
export const evaded = (damage: number, saved: boolean): number => (saved ? 0 : Math.floor(damage / 2));

/** A spell's result on a creature that stepped out of its way; `before` is its hit points before the spell. */
export function evadeResult(result: CastResult, before: number): CastResult {
  const damage = evaded(result.damage, !!result.save?.success);
  const ratio = result.damage ? damage / result.damage : 0;
  const parts = result.parts.map((p) => ({ ...p, dealt: Math.floor(p.dealt * ratio) }));
  const hp = Math.min(before, result.hp + result.damage - damage);
  return { ...result, damage, parts, hp };
}

/** The effect a negated hit leaves on its attacker: the feature's own, aimed at the reactor (Unreal Self: lost track). */
export function negateEffect(feature: FeatureSheet, reactor: string, attacker: string): Effect | undefined {
  const template = feature.spell?.effect;
  if (!template) return undefined;
  const { forCaster, ...rest } = template;
  return {
    ...rest,
    id: `${feature.id}-${reactor}-${attacker}`,
    name: rest.name ?? feature.name,
    source: reactor,
    ...(forCaster && { onlyFor: reactor }),
  };
}

import type { FeatureSheet } from './classes.ts';
import type { Creature } from './creature.ts';
import { abilityMod } from './creature-math.ts';
import { rollSave } from './effects.ts';
import { gainMomentum, momentumDice, regainFocus } from './momentum.ts';
import type { CastSide } from './spells.ts';
import type { Effect } from './spell-schema.ts';
import type { Token } from './token-schema.ts';
import type { Rng } from '@vtt/shared';

// What a jaeger's Chapter (subclass) adds on top of the base class: focus
// arts made stronger (Absolute: Counter Strike), finishers that knock the
// target down (Marauder: Fell the Leviathan), dice doubled (Titanic
// Strength), points and dice back when something happens (Sanguine: Crimson
// Rage, Salvation: Savior's Focus), and an effect while bloodied (Blood Frenzy).

/** A focus art: a hit reaction, one picked as a focus art, or one a Chapter grants. */
export const isFocusArt = (f: FeatureSheet): boolean => !!f.hitArt || f.choice === 'focus-art' || !!f.art;

export interface ArtBoost {
  /** Damage Weapon Parry blocks on top of its roll. */
  parryBonus: number;
  /** Weapon Parry hits back with what it blocked beyond the hit. */
  counter: boolean;
  /** Dodge Step always succeeds. */
  sureDodge: boolean;
}

/** What the creature's features add to its focus arts. */
export function artBoost(sheet: Pick<Creature, 'features'>): ArtBoost {
  const boosts = sheet.features.filter((f) => f.artBoost);
  const half = boosts.find((f) => f.artBoost?.parryBonus === 'half-level');
  return {
    parryBonus: half ? Math.floor((half.classLevel ?? 1) / 2) : 0,
    counter: boosts.some((f) => f.artBoost?.counter),
    sureDodge: boosts.some((f) => f.artBoost?.sureDodge),
  };
}

/** A point spent on a focus art: advantage on the next weapon attack before the end of the next turn (Counter Strike). */
export function afterArt(token: Token, sheet: Pick<Creature, 'features'>, feature: FeatureSheet): Token {
  const boost = sheet.features.find((f) => f.artBoost?.advantageAfter);
  if (!boost || !isFocusArt(feature)) return token;
  const effect: Effect = { id: `${boost.id}-${token.id}`, name: boost.name, advantage: true, once: true, rounds: 2 };
  return { ...token, effects: [...(token.effects ?? []).filter((e) => e.id !== effect.id), effect] };
}

/** Features with an effect while bloodied have it as their always-on effect while at half hit points or fewer. */
export function bloodiedPassives(features: FeatureSheet[], hp: number | undefined, maxHp: number): FeatureSheet[] {
  const bloodied = hp !== undefined && hp > 0 && hp <= maxHp / 2;
  if (!bloodied || !features.some((f) => f.whileBloodied)) return features;
  return features.map((f) => (f.whileBloodied ? { ...f, passive: { name: f.name, ...f.whileBloodied } } : f));
}

/** Titanic Strength: the dice held doubled, to one more than the most. */
export function doubleMomentum(token: Token, sheet: Pick<Creature, 'features'>): Token {
  const pool = momentumDice(sheet);
  const held = token.momentum?.dice ?? 0;
  if (!pool || !held) return token;
  return { ...token, momentum: { dice: Math.min(pool.max + 1, held * 2), fresh: true } };
}

/** Fell the Leviathan: after a finisher, a Strength save (Large or larger at disadvantage) or prone. */
export function fellOnFinish(
  { attacker, target }: { attacker: CastSide; target: CastSide },
  rng: Rng,
): { effect?: Effect; note?: string } {
  const feature = attacker.sheet.features.find((f) => f.finisherProne);
  if (!feature || target.sheet.hp <= 0) return {};
  const dc = 8 + attacker.sheet.proficiency + abilityMod(attacker.sheet.abilities.str);
  const big = target.token.size >= 2;
  const odds: Effect = { id: 'leviathan-odds', name: feature.name, saveDisadvantageFor: ['str'] };
  const saver = big ? { ...target.sheet, effects: [...target.sheet.effects, odds] } : target.sheet;
  const name = target.token.name;
  if (rollSave(saver, 'str', dc, rng).success) return { note: `${name} keeps its feet` };
  const effect: Effect = { id: `${feature.id}-${attacker.token.id}`, name: feature.name, conditions: ['prone'] };
  return { effect, note: `${name} is knocked prone` };
}

/** Why the finisher can't ride on this attack: Great Cleave needs a two-handed melee weapon. */
export function finisherWeaponProblem(
  feature: FeatureSheet,
  attack: { kind: string; weapon?: { properties: string[] } },
) {
  if (feature.finisher?.needs !== 'two-handed') return undefined;
  const ok = attack.kind === 'melee' && attack.weapon?.properties.includes('two-handed');
  return ok ? undefined : `needs a two-handed melee weapon for ${feature.name}`;
}

export type TriggerOn = NonNullable<FeatureSheet['trigger']>['on'];

/**
 * Features set off by `on`: their focus points back and momentum dice, and a
 * marker effect that keeps them from going off again for their cooldown.
 */
export function triggered(
  token: Token,
  sheet: Pick<Creature, 'features'>,
  on: TriggerOn,
): { token: Token; notes: string[] } {
  let out = token;
  const notes: string[] = [];
  for (const f of sheet.features.filter((s) => s.trigger?.on === on)) {
    const id = `${f.id}-cooldown`;
    if (out.effects?.some((e) => e.id === id)) continue;
    const { focus = 0, momentum = 0, cooldown } = f.trigger!;
    out = gainMomentum(regainFocus(out, sheet, focus), sheet, momentum);
    out = { ...out, effects: [...(out.effects ?? []), { id, name: `${f.name} (used)`, rounds: cooldown }] };
    notes.push(`${token.name}'s ${f.name}`);
  }
  return { token: out, notes };
}

/** Mystical Momentum: a spell slot spent gives as many momentum dice as its level. */
export function slotMomentum(token: Token, sheet: Pick<Creature, 'features'>, slot: number): Token {
  return sheet.features.some((f) => f.momentumOn?.slot) ? gainMomentum(token, sheet, slot) : token;
}

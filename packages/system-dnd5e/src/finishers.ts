import type { FeatureSheet } from './classes.ts';
import type { Creature } from './creature.ts';
import { abilityMod } from './creature-math.ts';
import { rollSave } from './effects.ts';
import { momentumDice } from './momentum.ts';
import { finisherWeaponProblem } from './chapters.ts';
import type { CastSide } from './spells.ts';
import type { Condition, Effect, Spell } from './spell-schema.ts';
import type { Ability, Attack, Damage } from './stats-schema.ts';
import { type Rng, roll } from '@vtt/shared';

// Finishers spend every momentum die a jaeger holds. Some ride on a hit
// (picked as the attack is readied, like a smite): extra damage, a condition
// that grows with the dice, a bleeding wound. Others are their own bonus
// action: a dash into an attack, a spectral claw, a volley of shots.

const hitFinisher = (sheet: Pick<Creature, 'features'>, id: string): FeatureSheet | undefined =>
  sheet.features.find((f) => f.id === id && f.finisher?.when === 'hit');

/** The hit finishers the creature knows (feature ids). */
export function hitFinishers(sheet: Pick<Creature, 'features'>): FeatureSheet[] {
  return sheet.features.filter((f) => f.finisher?.when === 'hit');
}

/** Why the creature can't use hit finisher `id` now, or undefined if it can. */
export function finisherProblem(sheet: Pick<Creature, 'features'>, id: string, attack?: Attack): string | undefined {
  const feature = hitFinisher(sheet, id);
  if (!feature) return "doesn't know that finisher";
  if (!momentumDice(sheet)?.dice) return 'has no momentum dice';
  return attack && finisherWeaponProblem(feature, attack);
}

/** The held dice as a formula, e.g. "3d6". */
export function momentumFormula(sheet: Pick<Creature, 'features'>): string {
  const pool = momentumDice(sheet);
  return pool?.dice ? `${pool.dice}d${pool.die}` : '0';
}

/** The extra damage a damage finisher adds to the hit it rides on. */
export function finisherDamage(
  sheet: Pick<Creature, 'features' | 'attacks'>,
  attack: Attack,
  id: string,
): Damage | undefined {
  const does = hitFinisher(sheet, id)?.finisher?.does;
  const type = attack.damage[0]!.type;
  if (does === 'damage') return { dice: momentumFormula(sheet), type };
  // Great Cleave: one die on the hit; the rest go into cleaving more foes.
  if (does === 'cleave') return { dice: `1d${momentumDice(sheet)!.die}`, type };
  return undefined;
}

/** 8 + proficiency + the best modifier of `from` (a finisher's save DC). */
export function finisherDc(sheet: Pick<Creature, 'abilities' | 'proficiency'>, from: readonly Ability[]): number {
  return 8 + sheet.proficiency + Math.max(...from.map((a) => abilityMod(sheet.abilities[a])));
}

/** Breaking Blow's save and condition by the dice spent. */
const BREAKS: [Ability, Condition][] = [
  ['str', 'prone'],
  ['con', 'blinded'],
  ['str', 'restrained'],
  ['con', 'stunned'],
  ['con', 'paralyzed'],
];

export interface FinisherHit {
  /** Effects left on the target. */
  effects: Effect[];
  /** Focus points it gives back. */
  regain: number;
  notes: string[];
  /** Attacks it gives against other foes in reach (great cleave). */
  attacks?: number;
}

interface HitInput {
  attacker: CastSide;
  target: CastSide;
  feature: FeatureSheet;
  /** The target dropped to 0 hit points from the hit. */
  downed: boolean;
}

/** What a hit finisher does once its hit lands: a condition, a bleed, or a point back for a kill. */
export function finisherOnHit(input: HitInput, rng: Rng): FinisherHit {
  const does = input.feature.finisher?.does;
  if (does === 'condition') return breakingBlow(input, rng);
  if (does === 'bleed') return bleeding(input);
  const regain = input.downed ? 1 : 0;
  if (does !== 'cleave') return { effects: [], regain, notes: [] };
  const dice = momentumDice(input.attacker.sheet)?.dice ?? 0;
  const notes = [
    `${input.attacker.token.name} cleaves on: ${dice} more attack${dice === 1 ? '' : 's'} at foes in reach`,
  ];
  return { effects: [], regain, notes, attacks: dice };
}

function breakingBlow({ attacker, target, feature }: HitInput, rng: Rng): FinisherHit {
  const pool = momentumDice(attacker.sheet);
  const [ability, condition] = BREAKS[Math.min(BREAKS.length, pool?.dice ?? 1) - 1]!;
  const dc = finisherDc(attacker.sheet, feature.dcFrom ?? ['str', 'dex']);
  const save = rollSave(target.sheet, ability, dc, rng);
  const name = target.token.name;
  if (save.success) return { effects: [], regain: 0, notes: [`${name} resists Breaking Blow (${save.total})`] };
  const lasting = condition === 'prone' ? {} : { rounds: 10, repeatSave: true, save: { ability, dc } };
  const effect: Effect = {
    id: `${feature.id}-${attacker.token.id}`,
    name: feature.name,
    conditions: [condition],
    source: attacker.token.id,
    ...lasting,
  };
  return { effects: [effect], regain: 1, notes: [`${name} is ${condition}`] };
}

function bleeding({ attacker, target, feature }: HitInput): FinisherHit {
  const pool = momentumDice(attacker.sheet)!;
  const id = `${feature.id}-${attacker.token.id}`;
  const before = target.token.effects?.find((e) => e.id === id)?.bleed?.dice ?? 0;
  const dc = finisherDc(attacker.sheet, feature.dcFrom ?? ['str', 'dex']);
  const bleed = { dice: Math.max(before, pool.dice), die: pool.die, dc };
  const effect: Effect = { id, name: 'Bleeding', bleed, source: attacker.token.id };
  return { effects: [effect], regain: 0, notes: [`${target.token.name} is bleeding`] };
}

/**
 * A bleed at the end of its bearer's turn: it loses the dice in hit points,
 * a die fewer next time, then saves to stop it. The effect after (none once
 * it stops) and what it lost.
 */
export function bleedTick(
  effect: Effect,
  sheet: Creature,
  rng: Rng,
): { lost: number; effect?: Effect; saved?: boolean } {
  const bleed = effect.bleed!;
  const lost = roll(`${bleed.dice}d${bleed.die}`, rng).total;
  const dice = bleed.dice - 1;
  if (dice <= 0) return { lost };
  const saved = rollSave(sheet, 'con', bleed.dc + Math.floor(dice / 2), rng).success;
  return saved ? { lost, saved } : { lost, effect: { ...effect, bleed: { ...bleed, dice } } };
}

export interface FinisherUse {
  /** An effect on the user (the chase's rider, the claw). */
  effect?: Effect;
  /** Extra movement in feet. */
  dash?: number;
  /** Attacks it gives. */
  grantAttacks?: number;
}

/** A finisher used as its own action: what the held dice give (call before they are spent). */
export function actionFinisher(feature: FeatureSheet, user: CastSide): FinisherUse {
  const pool = momentumDice(user.sheet);
  if (!pool?.dice || feature.finisher?.when !== 'action') return {};
  const base = { id: `${feature.id}-${user.token.id}`, name: feature.name, source: user.token.id, rounds: 1 };
  const dice = `${pool.dice}d${pool.die}`;
  if (feature.finisher.does === 'chase') {
    const effect: Effect = { ...base, hitDamage: [{ dice, type: 'weapon' }], once: true };
    return { effect, dash: 10 * pool.dice, grantAttacks: 1 };
  }
  if (feature.finisher.does !== 'claw') return {};
  const { str, dex } = user.sheet.abilities;
  const ability: Ability = abilityMod(dex) > abilityMod(str) ? 'dex' : 'str';
  const effect: Effect = {
    ...base,
    weaponSpell: { weapons: [], dice: ['1d12'], ability, type: 'slashing' },
    hitDamage: [{ dice, type: 'slashing' }],
    critRange: Math.max(10, 20 - 2 * pool.dice),
    endsOnAttack: true,
  };
  return { effect, grantAttacks: 1 };
}

/** A finisher or art aimed like a spell (volley): its dice and save DC filled in. */
export function poolSpell(spell: Spell, feature: FeatureSheet, sheet: Creature): Spell {
  const filled = JSON.parse(JSON.stringify(spell).replace(/\{momentum\}/g, momentumFormula(sheet))) as Spell;
  if (!feature.dcFrom || !filled.save) return filled;
  return { ...filled, save: { ...filled.save, dc: finisherDc(sheet, feature.dcFrom) } };
}

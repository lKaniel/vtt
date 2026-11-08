import { critDice } from './attack.ts';
import type { Creature } from './creature.ts';
import { rollSave } from './effects.ts';
import type { WeaponAttackOutcome } from './weapon-attack.ts';
import type { Attack } from './stats-schema.ts';
import { type Rng, roll } from '@vtt/shared';
import type { HitArt } from './class-fields.ts';

// Focus arts taken as a reaction to an attack about to hit, for a focus
// point: Weapon Parry (a weapon roll blocks that much damage) and Dodge Step
// (a Dex save against the attack roll evades it, or halves it on a failure).

/** The hit reactions (feature ids) the creature has a point left for. */
export function hitArts(sheet: Pick<Creature, 'features'>): string[] {
  return sheet.features.filter((f) => f.hitArt && f.left !== 0).map((f) => f.id);
}

/** What a hit reaction feature does, if `id` is one. */
export function hitArtOf(sheet: Pick<Creature, 'features'>, id: string): HitArt | undefined {
  return sheet.features.find((f) => f.id === id)?.hitArt;
}

/** The weapon a creature parries with: its first melee weapon, else any weapon. */
function parryWeapon(attacks: readonly Attack[]): Attack | undefined {
  const weapons = attacks.filter((a) => a.weapon && !a.offHand);
  return weapons.find((a) => a.kind === 'melee') ?? weapons[0];
}

const totalOf = (outcome: WeaponAttackOutcome) => outcome.roll.damage.reduce((n, d) => n + d.roll.total, 0);

/** The hit's damage less `amount`, taken off its parts in order. */
function lessDamage(outcome: WeaponAttackOutcome, amount: number): WeaponAttackOutcome {
  let left = amount;
  const damage = outcome.roll.damage.map((d) => {
    const cut = Math.min(left, d.roll.total);
    left -= cut;
    return { ...d, roll: { ...d.roll, total: d.roll.total - cut } };
  });
  return { ...outcome, roll: { ...outcome.roll, damage } };
}

export interface Parry {
  outcome: WeaponAttackOutcome;
  /** Damage blocked. */
  blocked: number;
  /** A natural 20 that blocked it all: the attacker is stunned until its next turn starts. */
  stuns: boolean;
  note: string;
}

/**
 * Weapon Parry: a weapon roll against the attacker blocks its damage roll
 * (dice doubled on a 20), nothing on a 1. `bonus` adds to the block.
 */
export function parry(outcome: WeaponAttackOutcome, reactor: Pick<Creature, 'attacks'>, rng: Rng, bonus = 0): Parry {
  const weapon = parryWeapon(reactor.attacks);
  if (!weapon) return { outcome, blocked: 0, stuns: false, note: 'has no weapon to parry with' };
  const d20 = roll(`1d20+${weapon.toHit}`, rng);
  const natural = d20.total - weapon.toHit;
  if (natural === 1) return { outcome, blocked: 0, stuns: false, note: 'parries and fumbles (a 1)' };
  const dice = natural === 20 ? critDice(weapon.damage[0]!.dice) : weapon.damage[0]!.dice;
  const block = roll(dice, rng).total + bonus;
  const incoming = totalOf(outcome);
  const blocked = Math.min(block, incoming);
  const stuns = natural === 20 && block >= incoming;
  const note = `parries with ${weapon.name}, blocking ${blocked} damage${stuns ? ' and stunning the attacker' : ''}`;
  return { outcome: lessDamage(outcome, blocked), blocked, stuns, note };
}

/** Dodge Step: a Dex save against the attack roll; a success evades it all, a failure halves it. `sure`: it succeeds. */
export function dodge(
  outcome: WeaponAttackOutcome,
  reactor: Creature,
  rng: Rng,
  sure = false,
): { outcome: WeaponAttackOutcome; note: string } {
  const success = sure || rollSave(reactor, 'dex', outcome.roll.total, rng).success;
  const incoming = totalOf(outcome);
  const taken = success ? 0 : Math.floor(incoming / 2);
  const note = success ? 'steps out of the way, taking no damage' : 'half dodges the blow';
  const less = lessDamage(outcome, incoming - taken);
  return { outcome: success ? { ...less, targetEffects: [], push: undefined } : less, note };
}

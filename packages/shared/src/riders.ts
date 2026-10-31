import type { Creature } from './creature.ts';
import type { Affected, UsedEffect } from './effects.ts';
import type { RiderDamage } from './spell-schema.ts';
import type { Attack, Damage, DamageType } from './stats-schema.ts';

// Damage that rides on hits: divine favor and smites on the attacker, hunter's
// mark and hex on the target, magic weapon bonuses and the 2014 paladin's
// Divine Smite.

/** Rider damage with "weapon" replaced by the type of the attack it rides on. */
function typed(list: readonly RiderDamage[], type: DamageType): Damage[] {
  return list.map((d) => ({ dice: d.dice, type: d.type === 'weapon' ? type : d.type }));
}

/** Damage marks on the target add when `attacker` hits it (hunter's mark, hex). */
export function markDamage(target: Affected, attacker: string, type: DamageType): Damage[] {
  return target.effects
    .filter((e) => e.markDamage && e.onlyFor === attacker)
    .flatMap((e) => typed(e.markDamage!, type));
}

/** Damage the attacker's own effects add to a weapon hit; one-hit riders are used up. */
export function hitRiders(
  attacker: { id: string; sheet: Affected },
  type: DamageType,
): { damage: Damage[]; used: UsedEffect[] } {
  const riders = attacker.sheet.effects.filter((e) => e.hitDamage);
  return {
    damage: riders.flatMap((e) => typed(e.hitDamage!, type)),
    used: riders.filter((e) => e.once).map((e) => ({ token: attacker.id, effect: e.id })),
  };
}

/** A weapon attack with magic weapon bonuses added to the roll and the damage. */
export function withWeaponBonus(attack: Attack, sheet: Affected): Attack {
  const bonus = sheet.effects.reduce((n, e) => n + (e.weaponBonus ?? 0), 0);
  if (!bonus || !attack.weapon) return attack;
  const [first, ...rest] = attack.damage;
  return { ...attack, toHit: attack.toHit + bonus, damage: [{ ...first!, dice: `${first!.dice}+${bonus}` }, ...rest] };
}

const SMITE_FOES = ['undead', 'fiend'];

/** 2014 Divine Smite: 2d8 radiant for a 1st-level slot, 1d8 more per level above, at most 5d8; 1d8 more against undead and fiends. */
export function divineSmite(slot: number, targetType: string): Damage {
  const dice = Math.min(5, slot + 1) + (SMITE_FOES.includes(targetType) ? 1 : 0);
  return { dice: `${dice}d8`, type: 'radiant' };
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** Why `sheet` can't Divine Smite with `attack` using a slot of level `slot`, or undefined if it can. */
export function smiteProblem(sheet: Creature, attack: Attack, slot: number): string | undefined {
  if (!sheet.features.some((f) => f.id === 'divine-smite') || !sheet.caster) return "can't smite";
  if (attack.kind !== 'melee') return 'can only smite with a melee attack';
  if (!sheet.caster.left[slot - 1]) return `has no ${ORDINAL[slot] ?? 'such'}-level slots left`;
  return undefined;
}

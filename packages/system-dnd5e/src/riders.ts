import type { Creature } from './creature.ts';
import type { Affected, UsedEffect } from './effects.ts';
import { abilityMod } from './creature-math.ts';
import type { Effect, RiderDamage } from './spell-schema.ts';
import type { Abilities, Attack, Damage, DamageType } from './stats-schema.ts';

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

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** The weapon spell on these effects that works on this attack (shillelagh: a club or quarterstaff), if any. */
function weaponSpellFor(attack: Attack, effects: readonly Effect[]): Effect['weaponSpell'] {
  if (!attack.weapon) return undefined;
  const name = slug(attack.name);
  return effects.find(
    (e) => e.weaponSpell && (!e.weaponSpell.weapons.length || e.weaponSpell.weapons.some((w) => name.startsWith(w))),
  )?.weaponSpell;
}

/** Attacks with the weapons a spell empowers: its ability for the roll and damage, its die and damage type. */
export function withWeaponSpells(
  attacks: readonly Attack[],
  effects: readonly Effect[],
  abilities: Abilities,
): Attack[] {
  if (!effects.some((e) => e.weaponSpell)) return [...attacks];
  return attacks.map((a) => {
    const ws = weaponSpellFor(a, effects);
    if (!ws || !a.weapon) return a;
    const ability = ws.ability ?? a.weapon.ability;
    const shift = abilityMod(abilities[ability]) - abilityMod(abilities[a.weapon.ability]);
    const [first, ...rest] = a.damage;
    const die = /^\d*d\d+/.exec(first!.dice)?.[0] ?? '';
    const tail = first!.dice.slice(die.length);
    const bonus = a.offHand || shift === 0 ? '' : signed(shift);
    const dice = `${ws.dice?.[0] ?? die}${tail}${bonus}`;
    const damage = [{ dice, type: ws.type ?? first!.type }, ...rest];
    return { ...a, toHit: a.toHit + shift, damage, weapon: { ...a.weapon, ability } };
  });
}

import { abilityMod } from './creature-math.ts';
import type { Weapon } from './item-schema.ts';
import type { Abilities, Ability, Attack } from './stats-schema.ts';

// The attacks a creature makes with its weapons, or with its fists when it has none.

/** Finesse weapons use the better of str and dex, ranged weapons dex, the rest str. */
function attackAbility(weapon: Weapon, abilities: Abilities): Ability {
  if (weapon.properties.includes('finesse')) return abilities.dex > abilities.str ? 'dex' : 'str';
  return weapon.kind === 'ranged' ? 'dex' : 'str';
}

/** An attack with the weapon; `proficiency` is 0 when the creature isn't trained with it. */
export function weaponAttack(weapon: Weapon, abilities: Abilities, proficiency: number): Attack {
  const ability = attackAbility(weapon, abilities);
  const mod = abilityMod(abilities[ability]);
  const reach = weapon.properties.includes('reach') ? 10 : 5;
  const where = weapon.kind === 'melee' ? { reach } : { range: weapon.range ?? [80, 320] };
  return {
    name: weapon.name,
    kind: weapon.kind,
    toHit: mod + proficiency,
    ...where,
    damage: [{ dice: withModifier(weapon.damage.dice, mod), type: weapon.damage.type }],
    weapon: { ability, properties: weapon.properties, mastery: weapon.mastery },
  };
}

export function unarmedStrike(abilities: Abilities, proficiency: number): Attack {
  const mod = abilityMod(abilities.str);
  return {
    name: 'Unarmed Strike',
    kind: 'melee',
    toHit: mod + proficiency,
    reach: 5,
    damage: [{ dice: String(Math.max(1, 1 + mod)), type: 'bludgeoning' }],
  };
}

function withModifier(dice: string, mod: number): string {
  if (mod === 0) return dice;
  return mod > 0 ? `${dice}+${mod}` : `${dice}${mod}`;
}

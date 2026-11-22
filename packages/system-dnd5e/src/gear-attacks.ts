import { abilityMod } from './creature-math.ts';
import type { Weapon } from './item-schema.ts';
import type { Abilities, Ability, Attack } from './stats-schema.ts';
import { type FormulaVars, formulaDamage, formulaHit } from './weapon-formula.ts';

// The attacks a creature makes with its weapons, or with its fists when it has none.

/** Finesse weapons use the better of str and dex, ranged weapons dex, the rest str. */
function attackAbility(weapon: Weapon, abilities: Abilities): Ability {
  if (weapon.properties.includes('finesse')) return abilities.dex > abilities.str ? 'dex' : 'str';
  return weapon.kind === 'ranged' ? 'dex' : 'str';
}

/** Who wields the weapon: `proficiency` is 0 when not trained with it; `level` the character's. */
export interface Wielder {
  abilities: Abilities;
  proficiency: number;
  level: number;
}

/** An attack with the weapon: by its own formulas where it has them, else ability modifier and proficiency. */
export function weaponAttack(weapon: Weapon, { abilities, proficiency, level }: Wielder): Attack {
  const ability = attackAbility(weapon, abilities);
  const mod = abilityMod(abilities[ability]);
  const reach = weapon.properties.includes('reach') ? 10 : 5;
  const where = weapon.kind === 'melee' ? { reach } : { range: weapon.range ?? [80, 320] };
  const vars = formulaVars(abilities, { mod, prof: proficiency, level });
  const own = weapon.formula;
  return {
    name: weapon.name,
    kind: weapon.kind,
    toHit: own?.hit ? formulaHit(own.hit, vars) : mod + proficiency,
    ...where,
    damage: own?.damage
      ? formulaDamage(own.damage, weapon.damage.type, vars)
      : [{ dice: withModifier(weapon.damage.dice, mod), type: weapon.damage.type }],
    weapon: { ability, properties: weapon.properties, mastery: weapon.mastery },
    ...(weapon.onHit && { onHit: weapon.onHit }),
  };
}

function formulaVars(abilities: Abilities, rest: Pick<FormulaVars, 'mod' | 'prof' | 'level'>): FormulaVars {
  const m = (a: Ability) => abilityMod(abilities[a]);
  return { str: m('str'), dex: m('dex'), con: m('con'), int: m('int'), wis: m('wis'), cha: m('cha'), ...rest };
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

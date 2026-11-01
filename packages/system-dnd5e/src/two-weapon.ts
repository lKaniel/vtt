import type { Creature } from './creature.ts';
import { abilityMod } from './creature-math.ts';
import type { Abilities, Attack } from './stats-schema.ts';

// Two-weapon fighting: after attacking with a light melee weapon, a bonus
// action attack with another light weapon, without the ability modifier to
// damage. With the 2024 nick mastery it's part of the Attack action instead.

const isLight = (a: Attack) => a.kind === 'melee' && !a.offHand && !!a.weapon?.properties.includes('light');

/** Off-hand versions of the creature's light melee weapons, when it wields two. */
export function offHandAttacks(attacks: readonly Attack[], abilities: Abilities): Attack[] {
  const light = attacks.filter(isLight);
  if (light.length < 2) return [];
  const names = [...new Set(light.map((a) => a.name))];
  return names.map((name) => {
    const a = light.find((l) => l.name === name)!;
    const mod = abilityMod(abilities[a.weapon!.ability]);
    const [first, ...rest] = a.damage;
    const dice = mod > 0 ? first!.dice.replace(new RegExp(`\\+${mod}$`), '') : first!.dice;
    return { ...a, name: `${name} (off-hand)`, offHand: true, damage: [{ ...first!, dice }, ...rest] };
  });
}

/** Whether the attack marks the turn for an off-hand attack to follow. */
export function lightAttack(attack: Attack): boolean {
  return isLight(attack);
}

/** Why an off-hand attack can't be made now: it needs a light-weapon attack first this turn. */
export function offHandProblem(used: readonly string[]): string | undefined {
  return used.includes('light-attack') ? undefined : 'must attack with a light weapon first';
}

/** A bonus action, or free once a turn when the weapon has the nick mastery. */
export function offHandCost(
  sheet: Pick<Creature, 'weaponMastery'>,
  attack: Attack,
  used: readonly string[],
): 'bonus' | 'free' {
  const nick = sheet.weaponMastery && attack.weapon?.mastery === 'nick' && !used.includes('nick');
  return nick ? 'free' : 'bonus';
}

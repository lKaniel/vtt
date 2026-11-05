import type { Creature } from './creature.ts';
import type { Effect } from './spell-schema.ts';
import type { Attack, Damage } from './stats-schema.ts';

// What fighting styles and a few subclass features change on the sheet and
// in an attack: archery, defense, dueling, the two-weapon fighting style, a
// champion's wider critical range and a life cleric's stronger healing.

const total = (
  effects: readonly Effect[],
  key: 'rangedAttackBonus' | 'armoredAc' | 'duelingDamage' | 'spellHealBonus',
) => effects.reduce((n, e) => n + (e[key] ?? 0), 0);

/** The lowest d20 face that crits for the creature's weapon attacks, when a feature lowers it. */
export function critRangeOf(sheet: Pick<Creature, 'effects'>): number | undefined {
  const ranges = sheet.effects.flatMap((e) => (e.critRange ? [e.critRange] : []));
  return ranges.length ? Math.min(...ranges) : undefined;
}

/** Dueling's damage: a one-handed melee weapon, and no off-hand weapon to go with it. */
export function duelingDamage(sheet: Pick<Creature, 'effects' | 'attacks'>, attack: Attack): Damage[] {
  const bonus = total(sheet.effects, 'duelingDamage');
  const oneHanded = attack.kind === 'melee' && !!attack.weapon && !attack.weapon.properties.includes('two-handed');
  if (!bonus || !oneHanded || attack.offHand || sheet.attacks.some((a) => a.offHand)) return [];
  return [{ dice: String(bonus), type: attack.damage[0]!.type }];
}

/** Disciple of life: what a healing spell of `level` heals on top. */
export function spellHealBonus(sheet: Pick<Creature, 'effects'>, level: number): number {
  const bonus = total(sheet.effects, 'spellHealBonus');
  return bonus && level >= 1 ? bonus + level : 0;
}

/** An off-hand attack with the main hand's damage, ability modifier included. */
function withMainDamage(a: Attack, attacks: readonly Attack[]): Attack {
  const main = attacks.find((m) => !m.offHand && `${m.name} (off-hand)` === a.name);
  return main ? { ...a, damage: [main.damage[0]!, ...a.damage.slice(1)] } : a;
}

/** Archery's bonus to ranged weapon attacks, two-weapon fighting's off-hand modifier, defense's AC in armor. */
export function withFightingStyles(c: Creature, inArmor: boolean): Creature {
  const ranged = total(c.effects, 'rangedAttackBonus');
  const offHand = c.effects.some((e) => e.offHandMod);
  const attacks = c.attacks.map((a) => {
    const aimed = ranged && a.kind === 'ranged' && a.weapon ? { ...a, toHit: a.toHit + ranged } : a;
    return offHand && a.offHand ? withMainDamage(aimed, c.attacks) : aimed;
  });
  return { ...c, attacks, ac: c.ac + (inArmor ? total(c.effects, 'armoredAc') : 0) };
}

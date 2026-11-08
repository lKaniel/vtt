import type { Creature } from './creature.ts';
import { abilityMod } from './creature-math.ts';
import type { Effect } from './spell-schema.ts';
import type { Attack, Damage } from './stats-schema.ts';

// What fighting styles and a few subclass features change on the sheet and
// in an attack: archery, defense, dueling, the two-weapon fighting style, a
// champion's wider critical range and a life cleric's stronger healing.

const total = (
  effects: readonly Effect[],
  key: 'rangedAttackBonus' | 'armoredAc' | 'duelingDamage' | 'spellHealBonus' | 'lightSpeed',
) => effects.reduce((n, e) => n + (e[key] ?? 0), 0);

/** The lowest d20 face that crits for the creature's weapon attacks, when a feature lowers it. */
export function critRangeOf(sheet: Pick<Creature, 'effects'>): number | undefined {
  const ranges = sheet.effects.flatMap((e) => (e.critRange ? [e.critRange] : []));
  return ranges.length ? Math.min(...ranges) : undefined;
}

/** Dueling's damage (a one-handed melee weapon, nothing in the off hand) and Titanic Strength's (two-handed). */
export function styleDamage(sheet: Pick<Creature, 'effects' | 'attacks' | 'abilities'>, attack: Attack): Damage[] {
  const bonus = total(sheet.effects, 'duelingDamage');
  const melee = attack.kind === 'melee' && !!attack.weapon;
  const twoHanded = melee && attack.weapon!.properties.includes('two-handed');
  const type = attack.damage[0]!.type;
  const great = twoHanded && sheet.effects.some((e) => e.twoHandedStrength) ? greatBonus(sheet) : 0;
  if (great > 0) return [{ dice: String(great), type }];
  if (!bonus || !melee || twoHanded || attack.offHand || sheet.attacks.some((a) => a.offHand)) return [];
  return [{ dice: String(bonus), type }];
}

const greatBonus = (sheet: Pick<Creature, 'abilities'>) => Math.ceil(abilityMod(sheet.abilities.str) / 2);

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

/** Body armor worn, by weight; undefined for none. */
export type ArmorWeight = 'light' | 'medium' | 'heavy';

/**
 * Archery's bonus to ranged weapon attacks, two-weapon fighting's off-hand
 * modifier, defense's AC in armor; a jaeger's speed in light armor, its
 * Constitution in medium armor, and attacks per action.
 */
export function withFightingStyles(c: Creature, armor: ArmorWeight | undefined): Creature {
  const ranged = total(c.effects, 'rangedAttackBonus');
  const offHand = c.effects.some((e) => e.offHandMod);
  const attacks = c.attacks.map((a) => {
    const aimed = ranged && a.kind === 'ranged' && a.weapon ? { ...a, toHit: a.toHit + ranged } : a;
    return offHand && a.offHand ? withMainDamage(aimed, c.attacks) : aimed;
  });
  const light = armor === undefined || armor === 'light';
  const speed = c.speed && light ? c.speed + total(c.effects, 'lightSpeed') : c.speed;
  const ac = c.ac + (armor ? total(c.effects, 'armoredAc') : 0) + (armor === 'medium' ? conArmor(c) : 0);
  const attacksPerAction = Math.max(c.attacksPerAction, ...c.effects.map((e) => e.actionAttacks ?? 0));
  return { ...c, attacks, ac, speed, attacksPerAction };
}

/** Marauder Momentum: Constitution (to +2) in place of Dexterity in medium armor, when it's more. */
function conArmor(c: Creature): number {
  if (!c.effects.some((e) => e.mediumArmorCon)) return 0;
  const cap = (n: number) => Math.min(2, abilityMod(n));
  return Math.max(0, cap(c.abilities.con) - cap(c.abilities.dex));
}

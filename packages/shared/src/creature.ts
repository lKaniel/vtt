import type { Content } from './content.ts';
import type { Token } from './schema.ts';
import {
  AbilitiesSchema,
  type Abilities,
  type Armor,
  type Attack,
  type DamageType,
  type Item,
  type Monster,
  type Stats,
  type Weapon,
} from './stats-schema.ts';

/** A token's game statistics, with everything derived from its gear worked out. */
export interface Creature {
  abilities: Abilities;
  proficiency: number;
  ac: number;
  hp: number;
  maxHp: number;
  /** Initiative bonus (the dexterity modifier). */
  initiative: number;
  attacks: Attack[];
  resistances: DamageType[];
  immunities: DamageType[];
  vulnerabilities: DamageType[];
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyForLevel(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

/** Proficiency bonus by challenge rating. */
function proficiencyForCr(cr: number): number {
  return Math.max(2, 2 + Math.floor((cr - 1) / 4));
}

/**
 * Works out a token's statistics from its monster stat block and/or its own
 * stats and equipped gear. Undefined for tokens without any (scenery, illusions).
 */
export function resolveCreature(token: Token, content: Content): Creature | undefined {
  const monster = token.monster ? content.monsters.get(token.monster) : undefined;
  if (token.monster ? !monster : !token.stats) return undefined;
  const stats = token.stats ?? {};
  const abilities = AbilitiesSchema.parse({ ...monster?.abilities, ...stats.abilities });
  const proficiency = defaultProficiency(stats, monster);
  const gear = equippedItems(token, content);
  const { maxHp, ac } = fixedNumbers(stats, monster);
  return {
    abilities,
    proficiency,
    ac: ac ?? armorClass(abilities, gear.armor),
    hp: Math.min(token.hp ?? maxHp, maxHp),
    maxHp,
    initiative: abilityMod(abilities.dex),
    attacks: creatureAttacks(stats, monster, gear.weapons, { abilities, proficiency }),
    ...defenses(stats, monster),
  };
}

function creatureAttacks(
  stats: Stats,
  monster: Monster | undefined,
  weapons: readonly Weapon[],
  { abilities, proficiency }: { abilities: Abilities; proficiency: number },
): Attack[] {
  const fromWeapons = weapons.map((w) => weaponAttack(w, abilities, proficiency));
  const natural = monster?.attacks ?? (fromWeapons.length ? [] : [unarmedStrike(abilities, proficiency)]);
  return [...natural, ...fromWeapons, ...(stats.attacks ?? [])];
}

function defenses(stats: Stats, monster: Monster | undefined): Pick<Creature, DefenseKey> {
  const pick = (key: DefenseKey) => stats[key] ?? monster?.[key] ?? [];
  return { resistances: pick('resistances'), immunities: pick('immunities'), vulnerabilities: pick('vulnerabilities') };
}

type DefenseKey = 'resistances' | 'immunities' | 'vulnerabilities';

/** Max HP and AC as written on the token or in the stat block; AC may be left to the armor. */
function fixedNumbers(stats: Stats, monster: Monster | undefined): { maxHp: number; ac?: number } {
  return { maxHp: stats.maxHp ?? monster?.hp ?? 1, ac: stats.ac ?? monster?.ac };
}

function defaultProficiency(stats: Stats, monster: Monster | undefined): number {
  if (stats.proficiency !== undefined) return stats.proficiency;
  if (stats.level !== undefined) return proficiencyForLevel(stats.level);
  return monster ? proficiencyForCr(monster.cr) : 2;
}

function equippedItems(token: Token, content: Content): { weapons: Weapon[]; armor: Armor[] } {
  const items = (token.inventory ?? [])
    .filter((e) => e.equipped)
    .map((e) => content.items.get(e.item))
    .filter((i): i is Item => i !== undefined);
  return {
    weapons: items.filter((i): i is Weapon => i.type === 'weapon'),
    armor: items.filter((i): i is Armor => i.type === 'armor'),
  };
}

/** AC from worn armor and shield, or 10 + dex without armor. */
export function armorClass(abilities: Abilities, armor: readonly Armor[]): number {
  const dex = abilityMod(abilities.dex);
  const shield = armor.filter((a) => a.category === 'shield').reduce((sum, a) => sum + a.ac, 0);
  const body = armor.find((a) => a.category !== 'shield');
  if (!body) return 10 + dex + shield;
  const dexBonus = { light: dex, medium: Math.min(dex, 2), heavy: 0 }[body.category as 'light' | 'medium' | 'heavy'];
  return body.ac + dexBonus + shield;
}

/** Finesse weapons use the better of str and dex, ranged weapons dex, the rest str. */
function attackAbility(weapon: Weapon, abilities: Abilities): number {
  const str = abilityMod(abilities.str);
  const dex = abilityMod(abilities.dex);
  if (weapon.properties.includes('finesse')) return Math.max(str, dex);
  return weapon.kind === 'ranged' ? dex : str;
}

/** Assumes proficiency with every weapon until class proficiencies arrive. */
export function weaponAttack(weapon: Weapon, abilities: Abilities, proficiency: number): Attack {
  const mod = attackAbility(weapon, abilities);
  const reach = weapon.properties.includes('reach') ? 10 : 5;
  const where = weapon.kind === 'melee' ? { reach } : { range: weapon.range ?? [80, 320] };
  return {
    name: weapon.name,
    kind: weapon.kind,
    toHit: mod + proficiency,
    ...where,
    damage: [{ dice: withModifier(weapon.damage.dice, mod), type: weapon.damage.type }],
  };
}

function unarmedStrike(abilities: Abilities, proficiency: number): Attack {
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

import type { Content } from './content.ts';
import { withBasicActions } from './basic-actions.ts';
import { offHandAttacks } from './two-weapon.ts';
import { makesDeathSaves } from './deaths.ts';
import {
  casterSheet,
  type CasterSheet,
  classOf,
  type FeatureSheet,
  featureSheets,
  grantedFeatures,
  levelValue,
} from './classes.ts';
import { abilityMod, proficiencyForLevel } from './creature-math.ts';
import type { Affected } from './effects.ts';
import { withOwn } from './own-content.ts';
import type { Token } from './token-schema.ts';
import type { Class, Condition, Effect } from './spell-schema.ts';
import {
  ABILITIES,
  type Abilities,
  AbilitiesSchema,
  type Ability,
  type Armor,
  type Attack,
  type DamageType,
  type Edition,
  type Item,
  type Monster,
  type Stats,
  type Weapon,
} from './stats-schema.ts';

/** A token's game statistics, with everything derived from its gear, class and effects worked out. */
export interface Creature extends Affected {
  /** The rules it plays by. */
  edition: Edition;
  abilities: Abilities;
  proficiency: number;
  ac: number;
  hp: number;
  maxHp: number;
  /** Temporary hit points, lost before `hp`. */
  tempHp: number;
  /** Walking speed in feet after effects; 0 while held in place. */
  speed: number;
  /** Initiative bonus (the dexterity modifier). */
  initiative: number;
  attacks: Attack[];
  resistances: DamageType[];
  immunities: DamageType[];
  vulnerabilities: DamageType[];
  /** Creature type, e.g. "humanoid"; characters count as humanoid. */
  type: string;
  /** Attacks per Attack action (extra attack). */
  attacksPerAction: number;
  /** Sneak attack dice, e.g. "2d6", for rogues. */
  sneakAttack?: string;
  /** Weapons' mastery properties apply (2024 martial classes). */
  weaponMastery: boolean;
  caster?: CasterSheet;
  features: FeatureSheet[];
}

/** Proficiency bonus by challenge rating. */
function proficiencyForCr(cr: number): number {
  return Math.max(2, 2 + Math.floor((cr - 1) / 4));
}

/**
 * Works out a token's statistics from its monster stat block and/or its own
 * stats and equipped gear. Undefined for tokens without any (scenery, illusions).
 */
export function resolveCreature(token: Token, books: Content): Creature | undefined {
  const content = withOwn(books, token);
  const monster = token.monster ? content.monsters.get(token.monster) : undefined;
  if (token.monster ? !monster : !token.stats) return undefined;
  const stats = token.stats ?? {};
  const cls = classOf(token, content);
  const abilities = AbilitiesSchema.parse({ ...monster?.abilities, ...stats.abilities });
  const proficiency = defaultProficiency(stats, monster);
  const gear = equippedItems(token, content);
  const { maxHp, ac } = fixedNumbers(stats, monster, classHp(cls, stats, abilities));
  const features = withBasicActions(featureSheets(token, cls, abilities, grantedFeatures(token, content)));
  const base: Creature = {
    edition: content.edition,
    abilities,
    proficiency,
    ac:
      ac ??
      armorClass(abilities, gear.armor, { ...features.find((f) => f.unarmoredAc), armorBase: armorBaseOf(token) }),
    // Clamped once effects have changed the maximum (aid).
    hp: token.hp ?? Number.POSITIVE_INFINITY,
    maxHp,
    tempHp: token.tempHp ?? 0,
    speed: token.speed,
    initiative: abilityMod(abilities.dex),
    attacks: creatureAttacks(stats, monster, gear.weapons, { abilities, proficiency }),
    ...defenses(stats, monster),
    ...kindAndSaves(monster, cls, { abilities, proficiency }),
    ...effectParts(token, features),
    ...classParts(token, cls),
    caster: casterSheet(token, { abilities, proficiency }, content),
    features,
  };
  return applyEffects(base);
}

/** Creature type (characters are humanoid) and saving throws, proficient ones from the class or stat block. */
function kindAndSaves(
  monster: Monster | undefined,
  cls: Class | undefined,
  { abilities, proficiency }: { abilities: Abilities; proficiency: number },
): Pick<Creature, 'type' | 'saves'> {
  const proficient = cls?.saves ?? monster?.saves ?? [];
  return { type: monster?.type ?? 'humanoid', saves: saveBonuses(abilities, proficiency, proficient) };
}

/** A character at 0 hp lies unconscious until it's healed. */
function downed(token: Token): Effect[] {
  if (!makesDeathSaves(token) || token.hp === undefined || token.hp > 0) return [];
  return [{ id: 'down', name: token.deathSaves?.dead ? 'Dead' : 'Down', conditions: ['unconscious', 'prone'] }];
}

/** The token's effects, then the ones its features always give (danger sense). */
function effectParts(token: Token, features: readonly FeatureSheet[]): Pick<Creature, 'effects' | 'conditions'> {
  const passive = features.flatMap((f) =>
    f.passive ? [{ ...f.passive, id: f.id, name: f.passive.name ?? f.name, source: token.id }] : [],
  );
  const effects = [...(token.effects ?? []), ...passive, ...downed(token)];
  return { effects, conditions: [...new Set(effects.flatMap((e) => e.conditions ?? []))] };
}

function classParts(
  token: Token,
  cls: Class | undefined,
): Pick<Creature, 'attacksPerAction' | 'sneakAttack' | 'weaponMastery'> {
  const level = token.stats?.level ?? 1;
  return {
    attacksPerAction: Math.max(1, levelValue(cls?.attacks ?? [], level)),
    sneakAttack: cls?.sneakAttack ? `${Math.ceil(level / 2)}d6` : undefined,
    weaponMastery: cls?.weaponMastery ?? false,
  };
}

function saveBonuses(
  abilities: Abilities,
  proficiency: number,
  proficient: readonly Ability[],
): Record<Ability, number> {
  const entries = ABILITIES.map((a) => [a, abilityMod(abilities[a]) + (proficient.includes(a) ? proficiency : 0)]);
  return Object.fromEntries(entries) as Record<Ability, number>;
}

/** Max hit points from the class: a full hit die at 1st level, the average after, plus Con each level. */
function classHp(cls: Class | undefined, stats: Stats, abilities: Abilities): number | undefined {
  if (!cls || !stats.level) return undefined;
  const con = abilityMod(abilities.con);
  return Math.max(1, cls.hitDie + con + (stats.level - 1) * (cls.hitDie / 2 + 1 + con));
}

const HELD: readonly Condition[] = ['grappled', 'paralyzed', 'petrified', 'restrained', 'stunned', 'unconscious'];

/** The best unarmored base AC an effect gives (mage armor), or 0. */
function armorBaseOf(token: Token): number {
  return Math.max(0, ...(token.effects ?? []).map((e) => e.armorBase ?? 0));
}

/** AC, hit points, speed and resistances changed by spells and features. */
function applyEffects(c: Creature): Creature {
  const effects = c.effects;
  const sum = (key: 'ac' | 'speed' | 'maxHp') => effects.reduce((n, e) => n + (e[key] ?? 0), 0);
  const held = c.conditions.some((x) => HELD.includes(x)) || effects.some((e) => e.immobile);
  const maxHp = c.maxHp + sum('maxHp');
  const minAc = Math.max(0, ...effects.map((e) => e.minAc ?? 0));
  const times = effects.reduce((n, e) => n * (e.speedTimes ?? 1), 1);
  return {
    ...c,
    maxHp,
    hp: Math.min(c.hp, maxHp),
    ac: Math.max(c.ac + sum('ac'), minAc),
    speed: held ? 0 : Math.floor(Math.max(0, c.speed + sum('speed')) * times),
    resistances: [...new Set([...c.resistances, ...effects.flatMap((e) => e.resistances ?? [])])],
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
  return [...natural, ...fromWeapons, ...offHandAttacks(fromWeapons, abilities), ...(stats.attacks ?? [])];
}

function defenses(stats: Stats, monster: Monster | undefined): Pick<Creature, DefenseKey> {
  const pick = (key: DefenseKey) => stats[key] ?? monster?.[key] ?? [];
  return { resistances: pick('resistances'), immunities: pick('immunities'), vulnerabilities: pick('vulnerabilities') };
}

type DefenseKey = 'resistances' | 'immunities' | 'vulnerabilities';

/** Max HP and AC as written on the token or in the stat block; AC may be left to the armor. */
function fixedNumbers(stats: Stats, monster: Monster | undefined, classHp?: number): { maxHp: number; ac?: number } {
  return { maxHp: stats.maxHp ?? monster?.hp ?? classHp ?? 1, ac: stats.ac ?? monster?.ac };
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

/** AC from worn armor and shield, or 10 + dex without armor (plus another ability with unarmored defense). */
export function armorClass(
  abilities: Abilities,
  armor: readonly Armor[],
  unarmored?: Pick<FeatureSheet, 'unarmoredAc' | 'unarmoredShield'> & { armorBase?: number },
): number {
  const dex = abilityMod(abilities.dex);
  const shield = armor.filter((a) => a.category === 'shield').reduce((sum, a) => sum + a.ac, 0);
  const body = armor.find((a) => a.category !== 'shield');
  if (!body) {
    const natural = 10 + unarmoredBonus(abilities, shield > 0, unarmored);
    return Math.max(natural, unarmored?.armorBase ?? 0) + dex + shield;
  }
  const dexBonus = { light: dex, medium: Math.min(dex, 2), heavy: 0 }[body.category as 'light' | 'medium' | 'heavy'];
  return body.ac + dexBonus + shield;
}

/** Finesse weapons use the better of str and dex, ranged weapons dex, the rest str. */
function attackAbility(weapon: Weapon, abilities: Abilities): Ability {
  if (weapon.properties.includes('finesse')) return abilities.dex > abilities.str ? 'dex' : 'str';
  return weapon.kind === 'ranged' ? 'dex' : 'str';
}

/** Assumes proficiency with every weapon until class proficiencies arrive. */
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

function unarmoredBonus(
  abilities: Abilities,
  shield: boolean,
  unarmored: Pick<FeatureSheet, 'unarmoredAc' | 'unarmoredShield'> | undefined,
): number {
  if (!unarmored?.unarmoredAc || (shield && unarmored.unarmoredShield === false)) return 0;
  return abilityMod(abilities[unarmored.unarmoredAc]);
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

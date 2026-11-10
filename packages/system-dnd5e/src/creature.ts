import type { Senses } from '@vtt/shared';
import type { Content } from './content.ts';
import { withBasicActions } from './basic-actions.ts';
import { encumbrance } from './carrying.ts';
import { ammunitionPlus, otherSpeeds, wearing, withItemBonuses, withWeaponMagic } from './worn-items.ts';
import { offHandAttacks } from './two-weapon.ts';
import { makesDeathSaves } from './deaths.ts';
import { poolParts, type PoolSheet } from './pools.ts';
import {
  casterSheet,
  classScales,
  type CasterSheet,
  type FeatureSheet,
  featureSheets,
  levelValue,
  type ScaleValue,
} from './classes.ts';
import { grantedFeatures } from './class-options.ts';
import { type ArmorWeight, withFightingStyles } from './class-styles.ts';
import { bloodiedPassives } from './chapters.ts';
import { abilityMod, proficiencyForLevel } from './creature-math.ts';
import type { Affected } from './effects.ts';
import { changed, changedBase, changedList } from './effect-changes.ts';
import { legendaryParts, type LegendaryParts } from './legendary.ts';
import { characterLevel, type ClassLevel, classLevels } from './multiclass.ts';
import { withOwn } from './own-content.ts';
import { withWeaponSpells } from './riders.ts';
import { exhausted } from './vigour.ts';
import { sensesOf } from './perception.ts';
import { type Form, formOf, shapeToken, withoutForm } from './forms.ts';
import { armorEffects, trainedWithWeapon, type Training, trainingOf } from './training.ts';
import { unarmedStrike, weaponAttack } from './gear-attacks.ts';
import type { Token } from './token-schema.ts';
import type { Class, Condition, Effect } from './spell-schema.ts';
import {
  ABILITIES,
  type Abilities,
  AbilitiesSchema,
  type Ability,
  type Attack,
  type DamageType,
  type Edition,
  type Stats,
} from './stats-schema.ts';
import type { Monster } from './monster-schema.ts';
import { monsterFeatures, monsterSkills, withMonsterSpeeds } from './monster-parts.ts';
import type { Armor, Item, Weapon } from './item-schema.ts';

/** A token's game statistics, with everything derived from its gear, class and effects worked out. */
export interface Creature extends Affected, LegendaryParts {
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
  /** Flying, swimming and climbing speeds its effects and items give, in feet. */
  speeds?: { fly?: number; swim?: number; climb?: number; hover?: boolean };
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
  /** What it perceives with (mirror image doesn't fool blindsight or truesight). */
  senses?: Senses;
  /** Numbers by class level a homebrew class shows (a pool's size). */
  scales?: ScaleValue[];
  /** A homebrew class's point pool (Lucidity), see pools.ts. */
  pool?: PoolSheet;
  /** Its challenge rating, or a character's level: what weights go by. */
  rank?: number;
  /** The saving throws it adds its proficiency to (the class's, or the stat block's). */
  proficientSaves?: Ability[];
  /** Skills its stat block is proficient in, and those it has expertise in (a character's are in its stats). */
  skills?: string[];
  expertise?: string[];
  /** Armor, weapons, tools and languages it is proficient with (training.ts). */
  proficiencies?: string[];
}

/** Proficiency bonus by challenge rating. */
function proficiencyForCr(cr: number): number {
  return Math.max(2, 2 + Math.floor((cr - 1) / 4));
}

/**
 * Works out a token's statistics from its monster stat block and/or its own
 * stats and equipped gear. Undefined for tokens without any (scenery, illusions).
 */
export function resolveCreature(raw: Token, books: Content): Creature | undefined {
  const form = formOf(raw);
  if (form) return formCreature(raw, form, books);
  const content = withOwn(books, raw);
  const token = wearing(raw, content);
  const monster = token.monster ? content.monsters.get(token.monster) : undefined;
  if (token.monster ? !monster : !token.stats) return undefined;
  const stats = token.stats ?? {};
  const levels = classLevels(token, content);
  const cls = levels[0]?.cls;
  const { abilities, proficiency } = changedScores(token, levels, content, {
    abilities: AbilitiesSchema.parse({ ...monster?.abilities, ...stats.abilities }),
    proficiency: defaultProficiency(stats, monster),
  });
  const gear = equippedItems(token, content);
  const training = trainingOf(token, levels, content);
  const { maxHp, ac } = fixedNumbers(stats, monster, classHp(levels, abilities));
  const features = withBasicActions(
    bloodiedPassives(
      featureSheets(token, levels, abilities, [...grantedFeatures(token, content), ...monsterFeatures(monster)]),
      token.hp,
      maxHp,
    ),
    token.effects,
  );
  const base: Creature = {
    edition: content.edition,
    abilities,
    proficiency,
    ac:
      ac ??
      armorClass(abilities, gear.armor, {
        ...features.find((f) => f.unarmoredAc),
        armorBase: armorBaseOf(token, features),
      }),
    // Clamped once effects have changed the maximum (aid).
    hp: token.hp ?? Number.POSITIVE_INFINITY,
    maxHp,
    tempHp: token.tempHp ?? 0,
    speed: token.speed,
    initiative: abilityMod(abilities.dex),
    attacks: creatureAttacks(stats, monster, gear.weapons, {
      abilities,
      proficiency,
      ammo: ammunitionPlus(token, content),
      training,
    }),
    ...defenses(stats, monster),
    ...kindAndSaves(monster, cls, { abilities, proficiency }),
    ...effectParts(token, features, content.edition, monster?.conditionImmunities),
    ...classParts(levels, monster),
    caster: withHandedSpells(casterSheet(token, { abilities, proficiency }, content), token, content),
    ...poolParts(token, levels, { abilities, proficiency }, monster),
    ...legendaryParts(token, monster),
    features,
    ...monsterSkills(monster),
    proficiencies: training.list,
    senses: sensesOf(
      token,
      monster,
      features.flatMap((f) => (f.passive ? [f.passive] : [])),
    ),
  };
  const trained = { ...base, effects: [...base.effects, ...armorEffects(training, gear.armor)] };
  const styled = withFightingStyles(applyEffects(withItemBonuses(trained, token, content)), armorWeight(gear.armor));
  const carrying = withCarrying(styled, token, { monster, content });
  return { ...carrying, speeds: withMonsterSpeeds(carrying.speeds, monster) };
}

/**
 * Spells another creature handed this one to use again (dragon's breath):
 * on its sheet while they last, cast with the giver's DC. A creature with no
 * spellcasting of its own gets a spell list just for them.
 */
function withHandedSpells(sheet: CasterSheet | undefined, token: Token, content: Content): CasterSheet | undefined {
  const known = new Set(sheet?.spells.map((s) => s.id));
  const handed = (token.effects ?? []).flatMap((e) => {
    const spell =
      e.repeat?.dc !== undefined && !known.has(e.repeat.spell) ? content.spells.get(e.repeat.spell) : undefined;
    return spell ? [spell] : [];
  });
  if (!handed.length) return sheet;
  const base = sheet ?? { ability: 'cha', attack: 0, dc: 10, level: 1, slots: [], left: [], pact: false, spells: [] };
  return { ...base, spells: [...base.spells, ...handed] };
}

/** A creature in another shape: the form's stat block, with its own hit points in 2024 (forms.ts). */
function formCreature(token: Token, form: Form, books: Content): Creature | undefined {
  const own = resolveCreature(withoutForm(token), books);
  if (!own) return undefined;
  const { int, wis, cha } = own.abilities;
  const shape = resolveCreature(shapeToken(token, form, { int, wis, cha }), books);
  if (!shape) return own;
  return form.hp === 'temp' ? { ...shape, hp: own.hp, maxHp: own.maxHp } : shape;
}

/** Speed lost and what else the variant encumbrance rule does at each level. */
const VARIANT_LOAD = {
  none: { slower: 0 },
  encumbered: { slower: 10 },
  heavy: {
    slower: 20,
    effect: {
      id: 'heavily-encumbered',
      name: 'Heavily encumbered',
      disadvantage: true,
      saveDisadvantageFor: ['str', 'dex', 'con'],
      checkDisadvantageFor: ['str', 'dex', 'con'],
    } satisfies Effect,
  },
} as const;

/**
 * A character carrying more than its capacity moves 5 ft at most, and the
 * variant rule slows it sooner (monsters don't count their loot).
 */
function withCarrying(
  c: Creature,
  token: Token,
  { monster, content }: { monster?: Monster; content: Content },
): Creature {
  if (monster) return c;
  const { over, level } = encumbrance(token, c.abilities.str, content);
  const load: { slower: number; effect?: Effect } = VARIANT_LOAD[level];
  const speed = Math.max(0, c.speed - load.slower);
  const effects = load.effect ? [...c.effects, load.effect] : c.effects;
  return { ...c, speed: over ? Math.min(speed, 5) : speed, effects };
}

/** Ability scores and proficiency after the changes of the token's effects and always-on features. */
function changedScores(
  token: Token,
  levels: readonly ClassLevel[],
  content: Content,
  base: { abilities: Abilities; proficiency: number },
): { abilities: Abilities; proficiency: number } {
  const features = featureSheets(token, levels, base.abilities, grantedFeatures(token, content));
  const passives = features.flatMap((f) => (f.passive ? [f.passive] : []));
  const effects = [...(token.effects ?? []), ...passives].filter((e) => !e.aura);
  if (!effects.some((e) => e.changes?.length)) return base;
  return changedBase(base.abilities, base.proficiency, effects);
}

/** Creature type (characters are humanoid) and saving throws, proficient ones from the class or stat block. */
function kindAndSaves(
  monster: Monster | undefined,
  cls: Class | undefined,
  { abilities, proficiency }: { abilities: Abilities; proficiency: number },
): Pick<Creature, 'type' | 'saves' | 'proficientSaves'> {
  const proficient = cls?.saves ?? monster?.saves ?? [];
  return {
    type: monster?.type ?? 'humanoid',
    saves: saveBonuses(abilities, proficiency, proficient),
    proficientSaves: [...proficient],
  };
}

/** A character at 0 hp lies unconscious until it's healed. */
function downed(token: Token): Effect[] {
  if (!makesDeathSaves(token) || token.hp === undefined || token.hp > 0) return [];
  return [{ id: 'down', name: token.deathSaves?.dead ? 'Dead' : 'Down', conditions: ['unconscious', 'prone'] }];
}

/** The token's effects, then the ones its features always give (danger sense). */
function effectParts(
  token: Token,
  features: readonly FeatureSheet[],
  edition: Edition,
  innate: readonly string[] = [],
): Pick<Creature, 'effects' | 'conditions'> {
  // An effect that gives off an aura reaches its bearer only as the aura (auras.ts).
  const effects = unsuppressed(
    [...ownEffects(token, features), ...downed(token), ...exhausted(token, edition)].filter((e) => !e.aura),
  );
  const immune = new Set<string>([...innate, ...effects.flatMap((e) => e.conditionImmunities ?? [])]);
  const conditions = new Set(effects.flatMap((e) => e.conditions ?? []));
  return { effects, conditions: [...conditions].filter((c) => !immune.has(c)) };
}

/** Inside an antimagic field spells' effects are suppressed while it lasts; the field itself stays. */
function unsuppressed(effects: Effect[]): Effect[] {
  if (!effects.some((e) => e.antimagic)) return effects;
  return effects.filter((e) => !e.spell || e.antimagic);
}

/** The token's effects, then the ones its features always give (danger sense), auras included. */
export function ownEffects(token: Token, features: readonly FeatureSheet[]): Effect[] {
  const passive = features.flatMap((f) =>
    f.passive ? [{ ...f.passive, id: f.id, name: f.passive.name ?? f.name, source: token.id }] : [],
  );
  return [...(token.effects ?? []), ...passive];
}

/** Extra attack (the best of its classes), sneak attack by rogue level and weapon mastery. */
function classParts(
  levels: readonly ClassLevel[],
  monster: Monster | undefined,
): Pick<Creature, 'attacksPerAction' | 'sneakAttack' | 'weaponMastery' | 'scales'> {
  const sneak = levels.find((l) => l.cls?.sneakAttack);
  return {
    scales: classScales(levels),
    attacksPerAction: Math.max(
      1,
      monster?.multiattack ?? 0,
      ...levels.map((l) => levelValue(l.cls?.attacks ?? [], l.level)),
    ),
    sneakAttack: sneak ? `${Math.ceil(sneak.level / 2)}d6` : undefined,
    weaponMastery: levels.some((l) => l.cls?.weaponMastery),
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

/** Max hit points from the classes: the first class's full hit die at 1st level, each die's average after, plus Con each level. */
export function classHp(levels: readonly ClassLevel[], abilities: Abilities): number | undefined {
  if (!levels.length || levels.some((l) => !l.cls)) return undefined;
  const con = abilityMod(abilities.con);
  const average = levels.reduce((n, l) => n + l.level * (l.cls!.hitDie / 2 + 1 + con), 0);
  const first = levels[0]!.cls!.hitDie;
  return Math.max(1, average + first / 2 - 1);
}

const HELD: readonly Condition[] = ['grappled', 'paralyzed', 'petrified', 'restrained', 'stunned', 'unconscious'];

/** The best unarmored base AC an effect or always-on feature gives (mage armor, draconic resilience), or 0. */
function armorBaseOf(token: Token, features: readonly FeatureSheet[]): number {
  return Math.max(
    0,
    ...[...(token.effects ?? []), ...features.map((f) => f.passive ?? {})].map((e) => e.armorBase ?? 0),
  );
}

/** AC, hit points, speed and resistances changed by spells and features. */
function applyEffects(c: Creature): Creature {
  const effects = c.effects;
  const sum = (key: 'ac' | 'speed' | 'maxHp') => effects.reduce((n, e) => n + (e[key] ?? 0), 0);
  const held = c.conditions.some((x) => HELD.includes(x)) || effects.some((e) => e.immobile);
  const hpTimes = effects.reduce((n, e) => n * (e.maxHpTimes ?? 1), 1);
  const maxHp = Math.max(1, Math.floor(changed(c.maxHp + sum('maxHp'), effects, 'maxHp') * hpTimes));
  const minAc = Math.max(0, ...effects.map((e) => e.minAc ?? 0));
  const times = effects.reduce((n, e) => n * (e.speedTimes ?? 1), 1);
  const speed = Math.max(0, changed(c.speed + sum('speed'), effects, 'speed'));
  return {
    ...c,
    ...changedSheet(c),
    maxHp,
    hp: Math.min(c.hp, maxHp),
    ac: changed(Math.max(c.ac + sum('ac'), minAc), effects, 'ac'),
    speed: held ? 0 : Math.floor(speed * times),
    speeds: otherSpeeds(effects, Math.floor(speed * times)),
    resistances: changedList(
      [...c.resistances, ...effects.flatMap((e) => e.resistances ?? [])],
      effects,
      'resistances',
    ),
  };
}

/** Initiative, saves, attack rolls and immunities after the effects' changes by key. */
function changedSheet(
  c: Creature,
): Pick<Creature, 'initiative' | 'saves' | 'attacks' | 'immunities' | 'vulnerabilities'> {
  const effects = c.effects;
  const saves = Object.fromEntries(
    ABILITIES.map((a) => [a, changed(changed(c.saves[a], effects, 'saves.all'), effects, `saves.${a}`)]),
  ) as Record<Ability, number>;
  return {
    initiative: changed(c.initiative, effects, 'initiative'),
    saves,
    attacks: withWeaponSpells(
      c.attacks.map((a) => ({ ...a, toHit: changed(a.toHit, effects, 'toHit') })),
      effects,
      c.abilities,
    ),
    immunities: changedList([...c.immunities, ...effects.flatMap((e) => e.immunities ?? [])], effects, 'immunities'),
    vulnerabilities: changedList(c.vulnerabilities, effects, 'vulnerabilities'),
  };
}

function creatureAttacks(
  stats: Stats,
  monster: Monster | undefined,
  weapons: readonly Weapon[],
  {
    abilities,
    proficiency,
    ammo,
    training,
  }: { abilities: Abilities; proficiency: number; ammo: number; training: Training },
): Attack[] {
  const fromWeapons = weapons.map((w) =>
    withWeaponMagic(weaponAttack(w, abilities, trainedWithWeapon(training, w) ? proficiency : 0), w, ammo),
  );
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
  const level = characterLevel(stats);
  if (level !== undefined) return proficiencyForLevel(level);
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

const bodyArmor = (armor: readonly Armor[]) => armor.find((a) => a.category !== 'shield');
const armorWeight = (armor: readonly Armor[]) => bodyArmor(armor)?.category as ArmorWeight | undefined;

/** AC from worn armor and shield, or 10 + dex without armor (plus another ability with unarmored defense). */
export function armorClass(
  abilities: Abilities,
  armor: readonly Armor[],
  unarmored?: Pick<FeatureSheet, 'unarmoredAc' | 'unarmoredShield'> & { armorBase?: number },
): number {
  const dex = abilityMod(abilities.dex);
  const shield = armor.filter((a) => a.category === 'shield').reduce((sum, a) => sum + a.ac, 0);
  const body = bodyArmor(armor);
  if (!body) {
    const natural = 10 + unarmoredBonus(abilities, shield > 0, unarmored);
    return Math.max(natural, unarmored?.armorBase ?? 0) + dex + shield;
  }
  const dexBonus = { light: dex, medium: Math.min(dex, 2), heavy: 0 }[body.category as 'light' | 'medium' | 'heavy'];
  return body.ac + dexBonus + shield;
}

function unarmoredBonus(
  abilities: Abilities,
  shield: boolean,
  unarmored: Pick<FeatureSheet, 'unarmoredAc' | 'unarmoredShield'> | undefined,
): number {
  if (!unarmored?.unarmoredAc || (shield && unarmored.unarmoredShield === false)) return 0;
  return abilityMod(abilities[unarmored.unarmoredAc]);
}

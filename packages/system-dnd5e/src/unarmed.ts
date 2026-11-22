import { type FeatureSheet, levelValue } from './classes.ts';
import { abilityMod } from './creature-math.ts';
import type { Creature } from './creature.ts';
import { unarmedStrike } from './gear-attacks.ts';
import type { Effect } from './spell-schema.ts';
import { ABILITIES, type Abilities, type Ability, type Attack } from './stats-schema.ts';

// Fighting unarmed: a monk's martial arts die on its unarmed strikes, and the
// unarmed attacks effects give (astral arms: Wisdom, force damage, a longer
// reach, one more die once a turn), with the abilities those effects let
// stand in for another on checks and saves (unarmed-schema.ts).

const UNARMED = 'Unarmed Strike';

const signed = (n: number) => {
  if (n === 0) return '';
  return n > 0 ? `+${n}` : `${n}`;
};

/** The better of these abilities for the creature. */
const best = (abilities: Abilities, list: readonly Ability[]): Ability =>
  list.reduce((a, b) => (abilityMod(abilities[b]) > abilityMod(abilities[a]) ? b : a));

/** An unarmed strike with the martial arts die: the better of Strength and Dexterity, d`die` bludgeoning. */
function martialStrike(c: Pick<Creature, 'abilities' | 'proficiency'>, die: number): Attack {
  const mod = abilityMod(c.abilities[best(c.abilities, ['str', 'dex'])]);
  return {
    name: UNARMED,
    kind: 'melee',
    toHit: mod + c.proficiency,
    reach: 5,
    damage: [{ dice: `1d${die}${signed(mod)}`, type: 'bludgeoning' }],
  };
}

/** The creature's martial arts die at its class level, if it has martial arts. */
function martialDie(features: readonly FeatureSheet[]): number | undefined {
  const f = features.find((x) => x.martialArts);
  return f && levelValue(f.martialArts!, f.classLevel ?? 1);
}

/** The die of an unarmed strike's damage ("1d6" of "1d6+3"), if it rolls one. */
const dieOf = (strike: Attack): string | undefined => /^\d*d\d+/.exec(strike.damage[0]!.dice)?.[0];

/** The unarmed attack an effect gives, made from the creature's unarmed strike. */
function givenAttack(c: Creature, strike: Attack, effect: Effect, once: boolean): Attack {
  const spec = effect.unarmedAttack!;
  const ability = best(c.abilities, ['str', 'dex', ...(spec.ability ? [spec.ability] : [])]);
  const mod = abilityMod(c.abilities[ability]);
  const die = dieOf(strike);
  const type = spec.type ?? strike.damage[0]!.type;
  const dice = die ? `${die}${signed(mod)}` : String(Math.max(1, 1 + mod));
  return {
    name: spec.name,
    kind: 'melee',
    toHit: mod + c.proficiency,
    reach: (strike.reach ?? 5) + (spec.reach ?? 0),
    damage: [{ dice, type }],
    ...(once && die && { onceDamage: [{ dice: die, type }] }),
  };
}

/** The creature's attacks with its martial arts strike first, and the unarmed attacks its effects give. */
function unarmedAttacks(c: Creature): Attack[] {
  const die = martialDie(c.features);
  const fist = die ? martialStrike(c, die) : c.attacks.find((a) => a.name === UNARMED);
  const own = die ? [fist!, ...c.attacks.filter((a) => a.name !== UNARMED)] : c.attacks;
  const makers = c.effects.filter((e) => e.unarmedAttack);
  if (!makers.length) return own;
  const strike = fist ?? unarmedStrike(c.abilities, c.proficiency);
  const once = c.effects.some((e) => e.unarmedOnceDie);
  const names = new Set(makers.map((e) => e.unarmedAttack!.name));
  const given = [...names].map((name) => makers.find((e) => e.unarmedAttack!.name === name)!);
  return [...own, ...given.map((e) => givenAttack(c, strike, e, once))];
}

/** The modifier a check or save in `ability` uses: its own, or a higher one an effect lets stand in for it. */
export function checkAbilityMod(
  sheet: Pick<Creature, 'abilities'> & Partial<Pick<Creature, 'effects'>>,
  ability: Ability,
): number {
  const stand = (sheet.effects ?? []).flatMap((e) => (e.abilityInPlace?.of === ability ? [e.abilityInPlace.use] : []));
  return Math.max(...[ability, ...stand].map((a) => abilityMod(sheet.abilities[a])));
}

/** Saving throws with the abilities effects let stand in for others. */
function standInSaves(c: Creature): Creature['saves'] {
  if (!c.effects.some((e) => e.abilityInPlace)) return c.saves;
  const shift = (a: Ability) => checkAbilityMod(c, a) - abilityMod(c.abilities[a]);
  return Object.fromEntries(ABILITIES.map((a) => [a, c.saves[a] + shift(a)])) as Creature['saves'];
}

/** The creature with its unarmed strikes and stand-in abilities worked out. */
export function withUnarmed(c: Creature): Creature {
  const unarmed = c.features.some((f) => f.martialArts) || c.effects.some((e) => e.unarmedAttack ?? e.abilityInPlace);
  if (!unarmed) return c;
  return { ...c, attacks: unarmedAttacks(c), saves: standInSaves(c) };
}

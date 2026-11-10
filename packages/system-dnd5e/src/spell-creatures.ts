import type { Spell, SpellCreature } from './spell-schema.ts';
import type { Monster } from './monster-schema.ts';
import type { Attack } from './stats-schema.ts';

// Creatures whose stat block comes with the spell (2024 giant insect, summon
// dragon, find steed, animate objects): built for the slot it was cast with
// and the caster's spell attack bonus and spellcasting modifier.

export type SummonOption = NonNullable<Spell['summon']>['options'][number];

/** The slot it was cast with, the spell's own level and the caster's numbers. */
export interface SummonCast {
  slot: number;
  level: number;
  /** Spell attack bonus. */
  attack: number;
  /** Spellcasting ability modifier. */
  mod: number;
}

/** The option's stat block for this casting, or undefined when it uses one from the bestiary. */
export function spellCreature(option: SummonOption, cast: SummonCast): Monster | undefined {
  const c = option.creature;
  if (!c) return undefined;
  return {
    id: option.monster,
    ...pick(c),
    ac: c.ac.base + c.ac.perLevel * cast.slot,
    hp: c.hp.base + c.hp.perLevel * Math.max(0, cast.slot - c.hp.from),
    cr: 0,
    tremorsense: 0,
    truesight: 0,
    saves: [],
    vulnerabilities: [],
    attacks: c.attacks.map((a) => attackFor(a, cast)),
    ...(c.multiattack && cast.slot >= 2 && { multiattack: Math.floor(cast.slot / 2) }),
  };
}

function pick(c: SpellCreature) {
  const { name, size, type, speed, darkvision, blindsight, abilities, resistances, immunities, conditionImmunities } =
    c;
  return { name, size, type, speed, darkvision, blindsight, abilities, resistances, immunities, conditionImmunities };
}

function attackFor(a: SpellCreature['attacks'][number], cast: SummonCast): Attack {
  const [first, ...rest] = a.damage;
  const above = cast.slot - cast.level;
  const dice = [
    first!.dice,
    a.plusLevel ? String(cast.slot) : '',
    a.plusMod ? String(cast.mod) : '',
    a.upDie && above > 0 ? `${above}${a.upDie}` : '',
  ]
    .filter(Boolean)
    .join('+');
  return {
    name: a.name,
    kind: a.kind,
    toHit: a.toHit ?? cast.attack,
    ...(a.reach && { reach: a.reach }),
    ...(a.range && { range: a.range }),
    damage: [{ ...first!, dice }, ...rest],
  };
}

/** How many of the option appear for this casting. */
export function summonCount(option: SummonOption, cast: SummonCast): number {
  const base = option.fromMod ? cast.mod : option.count;
  const more = (option.upCount ?? 0) * Math.max(0, cast.slot - cast.level);
  return Math.max(1, Math.floor((base + more) / (option.weight ?? 1)));
}

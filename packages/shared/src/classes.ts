import type { Content } from './content.ts';
import { abilityMod } from './creature-math.ts';
import type { Token } from './schema.ts';
import type { Class, Feature, LevelTable, Spell, Spellcasting } from './spell-schema.ts';
import type { Abilities, Ability } from './stats-schema.ts';

// What a character's class gives them at their level: spell slots, the
// spells they can cast and features with limited uses.

/** The value for the highest level in the table that `level` has reached; 0 before the first. */
export function levelValue(table: LevelTable, level: number): number {
  let value = 0;
  for (const [from, v] of table) if (level >= from) value = v;
  return value;
}

/** Spell slots per level (1st to 9th) for a full caster of each level. */
const FULL_CASTER: number[][] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const PACT_SLOTS: LevelTable = [
  [1, 1],
  [2, 2],
  [11, 3],
  [17, 4],
];
const PACT_LEVEL: LevelTable = [
  [1, 1],
  [3, 2],
  [5, 3],
  [7, 4],
  [9, 5],
];

function nineLevels(slots: readonly number[]): number[] {
  return Array.from({ length: 9 }, (_, i) => slots[i] ?? 0);
}

/** Slots per spell level, index 0 for 1st level. */
export function spellSlots(casting: Pick<Spellcasting, 'progression' | 'from'>, level: number): number[] {
  if (level < casting.from) return nineLevels([]);
  if (casting.progression === 'pact') {
    const slots = nineLevels([]);
    slots[levelValue(PACT_LEVEL, level) - 1] = levelValue(PACT_SLOTS, level);
    return slots;
  }
  const casterLevel = casting.progression === 'half' ? Math.ceil(level / 2) : level;
  return nineLevels(FULL_CASTER[casterLevel - 1] ?? []);
}

/** The class a token's `stats.class` names, matched by id or name. */
export function classOf(token: Token, content: Content): Class | undefined {
  const name = token.stats?.class?.toLowerCase();
  if (!name) return undefined;
  return content.classes.get(name) ?? [...content.classes.values()].find((c) => c.name.toLowerCase() === name);
}

export interface CasterSheet {
  ability: Ability;
  /** Spell attack bonus. */
  attack: number;
  dc: number;
  /** Caster level: cantrips and slots grow with it. */
  level: number;
  /** Slots per spell level (index 0 = 1st), and how many are left. */
  slots: number[];
  left: number[];
  /** Pact slots come back on a short rest. */
  pact: boolean;
  spells: Spell[];
}

interface Basics {
  abilities: Abilities;
  proficiency: number;
}

function spellcastingOf(token: Token, cls: Class | undefined): (Spellcasting & { level: number }) | undefined {
  const own = token.stats?.spellcasting;
  const level = own?.level ?? token.stats?.level ?? 1;
  if (own) return { ability: own.ability, progression: own.progression, from: 1, level };
  return cls?.spellcasting && { ...cls.spellcasting, level };
}

/** Spellcasting numbers for a token, or undefined if it casts nothing. */
export function casterSheet(
  token: Token,
  { abilities, proficiency }: Basics,
  content: Content,
): CasterSheet | undefined {
  const casting = spellcastingOf(token, classOf(token, content));
  if (!casting) return undefined;
  const mod = abilityMod(abilities[casting.ability]);
  const slots = spellSlots(casting, casting.level);
  const spent = token.spent?.slots ?? [];
  return {
    ability: casting.ability,
    attack: proficiency + mod,
    dc: 8 + proficiency + mod,
    level: casting.level,
    slots,
    left: slots.map((n, i) => Math.max(0, n - (spent[i] ?? 0))),
    pact: casting.progression === 'pact',
    spells: (token.stats?.spells ?? []).map((id) => content.spells.get(id)).filter((s): s is Spell => !!s),
  };
}

/** A class feature as the character sheet shows it. */
export interface FeatureSheet extends Feature {
  /** Uses at this level, and how many are left; undefined for unlimited features. */
  max?: number;
  left?: number;
}

/** The class features a token has at its level, with uses left. */
export function featureSheets(token: Token, cls: Class | undefined): FeatureSheet[] {
  const level = token.stats?.level ?? 1;
  const spent = token.spent?.uses ?? {};
  return (cls?.features ?? [])
    .filter((f) => f.level <= level)
    .map((f) => {
      if (!f.uses) return f;
      const max = levelValue(f.uses, level);
      return { ...f, max, left: Math.max(0, max - (spent[f.id] ?? 0)) };
    });
}

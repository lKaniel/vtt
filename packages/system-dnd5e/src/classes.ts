import type { Content } from './content.ts';
import { knownSpellIds, ownFeatures } from './own-content.ts';
import { abilityMod } from './creature-math.ts';
import type { Token } from './token-schema.ts';
import type { Class, Feature, LevelTable, Spell, Spellcasting } from './spell-schema.ts';
import type { Abilities, Ability, Edition } from './stats-schema.ts';
import {
  type CastingLevel,
  castingLevels,
  characterLevel,
  type ClassLevel,
  classLevels,
  multiclassCasterLevel,
} from './multiclass.ts';

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
  const share = { full: 1, half: 2, third: 3 }[casting.progression];
  return fullCasterSlots(Math.ceil(level / share));
}

const fullCasterSlots = (casterLevel: number): number[] => nineLevels(FULL_CASTER[casterLevel - 1] ?? []);

/** Slots of several caster classes: the full caster table at their combined level, plus pact slots apart. */
function combinedSlots(casters: readonly CastingLevel[], edition: Edition): { slots: number[]; pact: number[] } {
  const pactCasters = casters.filter((c) => c.casting.progression === 'pact');
  const others = casters.filter((c) => c.casting.progression !== 'pact');
  const single = others.length === 1 ? others[0] : undefined;
  const regular = single
    ? spellSlots(single.casting, single.level)
    : fullCasterSlots(multiclassCasterLevel(others, edition));
  const pact = nineLevels([]);
  for (const c of pactCasters) spellSlots(c.casting, c.level).forEach((n, i) => (pact[i]! += n));
  return { slots: regular.map((n, i) => n + pact[i]!), pact };
}

/** The class a token took at 1st level (its only class unless it multiclassed), matched by id or name. */
export function classOf(token: Pick<Token, 'stats'>, content: Content): Class | undefined {
  return classLevels(token, content)[0]?.cls;
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
  /** All its slots are pact slots, which come back on a short rest. */
  pact: boolean;
  /** The pact slots among `slots` of a multiclassed warlock (index 0 = 1st), back on a short rest. */
  pactSlots?: number[];
  spells: Spell[];
}

interface Basics {
  abilities: Abilities;
  proficiency: number;
}

interface Casting {
  ability: Ability;
  /** Caster level for cantrips: the character's level. */
  level: number;
  slots: number[];
  pact?: number[];
  allPact: boolean;
}

function spellcastingOf(token: Token, content: Content): Casting | undefined {
  const own = token.stats?.spellcasting;
  const level = characterLevel(token.stats) ?? 1;
  if (own) {
    const at = own.level ?? level;
    const slots = spellSlots({ progression: own.progression, from: 1 }, at);
    return { ability: own.ability, level: at, slots, allPact: own.progression === 'pact' };
  }
  const casters = castingLevels(classLevels(token, content));
  if (!casters.length) return undefined;
  const { slots, pact } = combinedSlots(casters, content.edition);
  const allPact = casters.every((c) => c.casting.progression === 'pact');
  const mixed = !allPact && pact.some((n) => n > 0);
  return { ability: casters[0]!.casting.ability, level, slots, allPact, ...(mixed && { pact }) };
}

/** Spellcasting numbers for a token, or undefined if it casts nothing. */
export function casterSheet(
  token: Token,
  { abilities, proficiency }: Basics,
  content: Content,
): CasterSheet | undefined {
  const casting = spellcastingOf(token, content);
  if (!casting) return undefined;
  const mod = abilityMod(abilities[casting.ability]);
  const slots = casting.slots;
  const spent = token.spent?.slots ?? [];
  return {
    ability: casting.ability,
    attack: proficiency + mod,
    dc: 8 + proficiency + mod,
    level: casting.level,
    slots,
    left: slots.map((n, i) => Math.max(0, n - (spent[i] ?? 0))),
    pact: casting.allPact,
    ...(casting.pact && { pactSlots: casting.pact }),
    spells: knownSpellIds(token)
      .map((id) => content.spells.get(id))
      .filter((s): s is Spell => !!s),
  };
}

/** A class feature as the character sheet shows it. */
export interface FeatureSheet extends Omit<Feature, 'spell'> {
  /** Uses at this level, and how many are left; undefined for unlimited features. */
  max?: number;
  left?: number;
  /** For features aimed like spells, with "{die}" filled in. */
  spell?: Partial<Spell>;
  /** Levels in the class it comes from (the character's level for granted features): its tables read this. */
  classLevel?: number;
}

/** Most uses at `level`: a fixed table, an ability modifier (at least 1), or hit points per level. */
function maxUses(f: Feature, level: number, abilities: Abilities): number | undefined {
  if (f.usesAbility) return Math.max(1, abilityMod(abilities[f.usesAbility]));
  if (f.poolPerLevel) return f.poolPerLevel * level;
  return f.uses && levelValue(f.uses, level);
}

/** The spell a feature is aimed like, with its die for this level filled in. */
function featureSpell(f: Feature, level: number): Partial<Spell> | undefined {
  if (!f.spell) return undefined;
  const die = String(levelValue(f.die ?? [], level));
  return JSON.parse(JSON.stringify(f.spell).replace(/\{die\}/g, die)) as Partial<Spell>;
}

/** A feature's always-on effect at this class level: its speed bonus and aura radius filled in. */
function passiveAt(f: Feature, level: number): Feature['passive'] {
  const p = f.passive;
  if (!p) return undefined;
  const speed = f.speed && { speed: levelValue(f.speed, level) };
  const aura = f.auraRadius && p.aura && { aura: { ...p.aura, radius: levelValue(f.auraRadius, level) } };
  return { ...p, ...speed, ...aura };
}

function sheetOf(f: Feature, level: number, abilities: Abilities, spent: Record<string, number>): FeatureSheet {
  const short = f.shortRestFrom !== undefined && level >= f.shortRestFrom;
  const passive = passiveAt(f, level);
  const base: FeatureSheet = {
    ...f,
    passive,
    spell: featureSpell(f, level),
    classLevel: level,
    ...(short && { recharge: 'short' as const }),
  };
  const max = maxUses(f, level, abilities);
  if (max === undefined) return base;
  return { ...base, max, left: Math.max(0, max - (spent[f.id] ?? 0)) };
}

/** The features each class gives at its level and those granted by hand, with uses left; `usesFrom` features share another's. */
export function featureSheets(
  token: Token,
  levels: readonly ClassLevel[],
  abilities: Abilities,
  granted: readonly Feature[] = [],
): FeatureSheet[] {
  const total = characterLevel(token.stats) ?? 1;
  const spent = token.spent?.uses ?? {};
  const own = levels.flatMap((l) =>
    (l.cls?.features ?? []).filter((f) => f.level <= l.level).map((f) => ({ f, level: l.level })),
  );
  const fresh = own.filter((o, i) => own.findIndex((p) => p.f.id === o.f.id) === i);
  const extra = granted.filter((g) => !fresh.some((o) => o.f.id === g.id)).map((f) => ({ f, level: total }));
  const sheets = [...fresh, ...extra].map(({ f, level }) => sheetOf(f, level, abilities, spent));
  return sheets.map((f) => {
    const from = f.usesFrom ? sheets.find((s) => s.id === f.usesFrom) : undefined;
    return from ? { ...f, max: from.max, left: from.left } : f;
  });
}

/** The features a token was granted on top of its class ("barbarian/rage"); unknown ones are left out. */
export function grantedFeatures(token: Token, content: Content): Feature[] {
  const fromClasses = (token.stats?.features ?? []).flatMap((ref) => {
    const found = classFeature(ref, content);
    return found ? [found] : [];
  });
  return [...fromClasses, ...ownFeatures(token)];
}

/** A class feature by "<class>/<feature>". */
export function classFeature(ref: string, content: Content): Feature | undefined {
  const [cls, id] = ref.split('/');
  return content.classes.get(cls ?? '')?.features.find((f) => f.id === id);
}

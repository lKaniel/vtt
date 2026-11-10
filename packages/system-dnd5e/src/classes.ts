import type { Content } from './content.ts';
import { knownSpellIds } from './own-content.ts';
import { featureSpellIds, levelFeatures } from './class-options.ts';
import { abilityMod, proficiencyForLevel } from './creature-math.ts';
import { type PowerLevel, powerAt } from './powers.ts';
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
export function spellSlots(casting: Pick<Spellcasting, 'progression' | 'from' | 'slots'>, level: number): number[] {
  if (level < casting.from) return nineLevels([]);
  if (casting.slots) {
    const slots = nineLevels([]);
    slots[levelValue(casting.slots.level, level) - 1] = levelValue(casting.slots.count, level);
    return slots;
  }
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
  /** Spells cast at their own level without a slot: a non-caster's homemade ones. */
  atWill?: string[];
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
  /** No slots: its homemade spells are cast at will. */
  atWill?: boolean;
}

function spellcastingOf(token: Token, content: Content): Casting | undefined {
  const own = token.stats?.spellcasting;
  const level = characterLevel(token.stats) ?? 1;
  if (own?.progression === 'none') return { ability: own.ability, level, slots: [], allPact: false, atWill: true };
  if (own) {
    const at = own.level ?? level;
    const slots = spellSlots({ progression: own.progression, from: 1 }, at);
    return { ability: own.ability, level: at, slots, allPact: own.progression === 'pact' };
  }
  const levels = classLevels(token, content);
  const casters = castingLevels(levels);
  if (!casters.length) return slotlessCasting(token, level, { levels, content });
  const { slots, pact } = combinedSlots(casters, content.edition);
  const allPact = casters.every((c) => c.casting.progression === 'pact');
  const mixed = !allPact && pact.some((n) => n > 0);
  return { ability: casters[0]!.casting.ability, level, slots, allPact, ...(mixed && { pact }) };
}

/**
 * A creature with no spellcasting casts its homemade spells at will, and the
 * spells its features pay for (a pool's points, a feature's uses): with its
 * class pool's ability, else its best mental one.
 */
function slotlessCasting(
  token: Token,
  level: number,
  { levels, content }: { levels: readonly ClassLevel[]; content: Content },
): Casting | undefined {
  if (!token.own?.spells?.length && !featureSpellIds(token, content).length) return undefined;
  const a = token.stats?.abilities ?? {};
  const best = (['int', 'wis', 'cha'] as const).reduce((top, k) => ((a[k] ?? 10) > (a[top] ?? 10) ? k : top));
  const ability = levels.find((l) => l.cls?.pool)?.cls?.pool?.ability ?? best;
  return { ability, level, slots: [], allPact: false, atWill: true };
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
    spells: [...new Set([...knownSpellIds(token), ...featureSpellIds(token, content)])]
      .map((id) => content.spells.get(id))
      .filter((s): s is Spell => !!s),
    ...(casting.atWill && { atWill: token.own?.spells?.map((s) => s.id) ?? [] }),
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
  if (f.usesAbility) return Math.max(1, abilityMod(abilities[f.usesAbility])) + (f.usesBonus ?? 0);
  if (f.poolPerLevel) return f.poolPerLevel * level;
  return f.uses && levelValue(f.uses, level);
}

/** The spell a feature is aimed like, with its die for this level filled in. */
function featureSpell(f: Feature, level: number): Partial<Spell> | undefined {
  if (!f.spell) return undefined;
  const die = String(levelValue(f.die ?? [], level));
  const later = (f.spellAt ?? []).filter(([from]) => level >= from).map(([, set]) => set);
  const spell = Object.assign({}, f.spell, ...later) as Record<string, unknown>;
  return JSON.parse(JSON.stringify(spell).replace(/\{die\}/g, die)) as Partial<Spell>;
}

/** A feature's always-on effect at this class level: its speed bonus and aura radius filled in. */
function passiveAt(f: Feature, level: number): Feature['passive'] {
  const p = f.passive;
  if (!p) return undefined;
  const speed = f.speed && { speed: levelValue(f.speed, level) };
  const aura = f.auraRadius && p.aura && { aura: { ...p.aura, radius: levelValue(f.auraRadius, level) } };
  const hp = f.hpPerLevel && { maxHp: f.hpPerLevel * level };
  return { ...p, ...speed, ...aura, ...hp };
}

/** The effect a feature gives at this class level: the highest `effectAt` reached, else its `effect`. */
const effectAt = (f: Feature, level: number): Feature['effect'] =>
  (f.effectAt ?? []).filter(([from]) => level >= from).at(-1)?.[1] ?? f.effect;

interface SheetContext {
  level: number;
  abilities: Abilities;
  spent: Record<string, number>;
  power: PowerLevel;
}

function sheetOf(raw: Feature, { level, abilities, spent, power }: SheetContext): FeatureSheet {
  const f = powerAt(raw, power);
  const short = f.shortRestFrom !== undefined && level >= f.shortRestFrom;
  const passive = passiveAt(f, level);
  const base: FeatureSheet = {
    ...f,
    effect: effectAt(f, level),
    passive,
    spell: featureSpell(f, level),
    classLevel: level,
    ...(short && { recharge: 'short' as const }),
  };
  const max = maxUses(f, level, abilities);
  if (max === undefined) return base;
  return { ...base, max, left: Math.max(0, max - (spent[f.id] ?? 0)) };
}

/** What "{mod}" and learned options read for a class's features: its pool's ability. */
function powerLevel(token: Token, l: Pick<ClassLevel, 'id' | 'cls' | 'level'>, abilities: Abilities): PowerLevel {
  const ability = l.cls?.pool?.ability;
  return {
    level: l.level,
    mod: ability ? abilityMod(abilities[ability]) : 0,
    known: new Set(token.stats?.features ?? []),
    cls: l.id,
  };
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
  const own = levels.flatMap((l) => levelFeatures(l).map((f) => ({ f, level: l.level, l })));
  const fresh = own.filter((o, i) => own.findIndex((p) => p.f.id === o.f.id) === i);
  const first = levels[0] ?? { id: '', level: total };
  const extra = granted
    .filter((g) => !fresh.some((o) => o.f.id === g.id))
    .map((f) => ({ f, level: total, l: { ...first, level: total } }));
  const sheets = withPools(
    [...fresh, ...extra].map(({ f, level, l }) =>
      sheetOf(f, { level, abilities, spent, power: powerLevel(token, l, abilities) }),
    ),
    token,
    abilities,
  );
  return sheets.map((f) => {
    const from = f.usesFrom ? sheets.find((s) => s.id === f.usesFrom) : undefined;
    return from ? { ...f, max: from.max, left: from.left } : f;
  });
}

/** More uses another feature gives (focused fighting), and a momentum pool's size and dice held. */
function withPools(sheets: FeatureSheet[], token: Token, abilities: Abilities): FeatureSheet[] {
  const more = (id: string) => sheets.reduce((n, s) => n + (s.moreUses?.of === id ? s.moreUses.by : 0), 0);
  return sheets.map((s) => {
    if (s.momentum) {
      const prof = proficiencyForLevel(characterLevel(token.stats) ?? 1);
      const max = prof + Math.max(abilityMod(abilities.str), abilityMod(abilities.dex));
      // Titanic Strength can double the dice to one past the most.
      return { ...s, max, left: Math.min(max + 1, token.momentum?.dice ?? 0) };
    }
    const by = s.max === undefined ? 0 : more(s.id);
    return by ? { ...s, max: s.max! + by, left: s.left! + by } : s;
  });
}

/** The class's scale values at its level (custom advancement). */
export function classScales(levels: readonly ClassLevel[]): ScaleValue[] {
  return levels.flatMap((l) =>
    (l.cls?.scales ?? []).map((s) => ({ id: s.id, name: s.name, value: levelValue(s.values, l.level) })),
  );
}

export interface ScaleValue {
  id: string;
  name: string;
  value: number;
}

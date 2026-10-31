import { applyDamage, critDice, tokenDistance } from './attack.ts';
import type { Creature } from './creature.ts';
import { abilityMod } from './creature-math.ts';
import { roll, type Rng, type Roll } from './dice.ts';
import { attackModifiers, d20Formula, rollSave, type SaveRoll, type UsedEffect } from './effects.ts';
import type { Token } from './schema.ts';
import type { Effect, Spell } from './spell-schema.ts';
import type { Damage, DamageType } from './stats-schema.ts';

// Casting a spell: what it does at the slot it's cast with, whether the
// caster may cast it, and rolling its attacks, saves, damage and healing.

const CANTRIP_TIERS = [5, 11, 17];

/** The number of dice in "2d6" (2) or "d6" (1). */
const diceCount = (count: string | undefined) => (count ? Number(count) : 1);

/** "8d6" plus "1d6" twice is "10d6"; dice of another size are added on, e.g. "1d6+2d8". */
function addDice(base: string, per: string | undefined, times: number): string {
  const p = per ? /^(\d*)d(\d+)$/.exec(per) : null;
  if (!p || times <= 0) return base;
  const extra = times * diceCount(p[1]);
  const m = /^(\d*)d(\d+)/.exec(base);
  if (!m || m[2] !== p[2]) return `${base}+${extra}d${p[2]}`;
  return `${diceCount(m[1]) + extra}d${m[2]}${base.slice(m[0].length)}`;
}

/** Multiplies the dice of a formula: cantrip damage at higher levels. */
function timesDice(formula: string, n: number): string {
  return formula.replace(/^(\d*)d/, (_, c: string) => `${diceCount(c) * n}d`);
}

/** The spell as it works when cast with `slot` by a caster of `casterLevel`. */
export function scaledSpell(spell: Spell, slot: number, casterLevel: number): Spell & { beams: number } {
  const extra = Math.max(0, slot - spell.level);
  const tier = 1 + CANTRIP_TIERS.filter((l) => casterLevel >= l).length;
  const cantrip = spell.level === 0 ? spell.cantrip : undefined;
  const damage = spell.damage.map((d) => ({
    ...d,
    dice: cantrip === 'dice' ? timesDice(d.dice, tier) : addDice(d.dice, spell.upcast?.damage, extra),
  }));
  const baseBeams = spell.beams ?? 1;
  return {
    ...spell,
    damage,
    heal: spell.heal && addDice(spell.heal, spell.upcast?.heal, extra),
    targets: spell.targets + extra * (spell.upcast?.targets ?? 0),
    beams: cantrip === 'beams' ? baseBeams + tier - 1 : baseBeams + extra * (spell.upcast?.beams ?? 0),
  };
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** Why `sheet` can't cast `spell` with `slot` right now, or undefined if it can. */
export function castProblem({
  spell,
  slot,
  sheet,
}: {
  spell: Spell;
  slot: number;
  sheet: Creature;
}): string | undefined {
  const caster = sheet.caster;
  if (!caster?.spells.some((s) => s.id === spell.id)) return `doesn't know ${spell.name}`;
  if (spell.level === 0) return undefined;
  if (slot < spell.level || slot > 9) return `needs a slot of ${ORDINAL[spell.level]} level or higher`;
  if (!caster.left[slot - 1]) return `has no ${ORDINAL[slot]}-level slots left`;
  return undefined;
}

export interface CastSide {
  token: Token;
  sheet: Creature;
}

export interface CastInput {
  spell: Spell;
  slot: number;
  caster: CastSide;
  /** One entry per target or beam, in order; the same creature may appear more than once. */
  targets: readonly CastSide[];
  gridSize: number;
}

export interface DamageDealt {
  roll: Roll;
  type: DamageType;
  dealt: number;
}

/** What one target (or one beam) got. */
export interface CastResult {
  target: string;
  attack?: Roll;
  hit?: boolean;
  crit?: boolean;
  save?: SaveRoll;
  /** Total damage after resistances, and each part. */
  damage: number;
  parts: DamageDealt[];
  healed?: number;
  /** Hit points after this result. */
  hp: number;
  effect?: Effect;
  /** The spell doesn't work on this kind of creature. */
  immune?: boolean;
  /** Feet the target is pushed away from the caster (negative: pulled closer). */
  push?: number;
}

export interface CastOutcome {
  results: CastResult[];
  /** One-shot effects that were used up, e.g. a guiding bolt's advantage. */
  used: UsedEffect[];
}

interface Cast {
  spell: Spell & { beams: number };
  /** One damage roll shared by every target, for spells without attacks or beams. */
  shared?: { roll: Roll; type: DamageType }[];
  caster: CastSide;
  dc: number;
  attackBonus: number;
  mod: number;
  gridSize: number;
  rng: Rng;
}

function rollDamage(parts: readonly Damage[], crit: boolean, rng: Rng): { roll: Roll; type: DamageType }[] {
  return parts.map((d) => ({ roll: roll(crit ? critDice(d.dice) : d.dice, rng), type: d.type }));
}

function dealt(target: Creature, rolls: { roll: Roll; type: DamageType }[], half: boolean) {
  const amounts = rolls.map((r) => ({ amount: half ? Math.floor(r.roll.total / 2) : r.roll.total, type: r.type }));
  const { dealt: each, hp } = applyDamage(target, amounts);
  return { parts: rolls.map((r, i) => ({ ...r, dealt: each[i]! })), hp, damage: each.reduce((s, d) => s + d, 0) };
}

function effectFor(cast: Cast): Effect | undefined {
  const { spell, caster, dc } = cast;
  if (!spell.effect) return undefined;
  const { repeatSave, ...template } = spell.effect;
  return {
    ...template,
    id: `${spell.id}-${caster.token.id}`,
    name: template.name ?? spell.name,
    source: caster.token.id,
    concentration: spell.concentration || undefined,
    rounds: template.rounds ?? spell.rounds,
    repeatSave,
    save: repeatSave && spell.save ? { ability: spell.save.ability, dc } : undefined,
  };
}

/** Attack roll against the target: hit or miss, and one-shot effects it used. */
function spellAttack(cast: Cast, target: CastSide, used: UsedEffect[]) {
  const within5 = tokenDistance(cast.caster.token, target.token, cast.gridSize) <= 5;
  const mods = attackModifiers(cast.caster, target, { within5 });
  used.push(...mods.used);
  const attack = roll(d20Formula(cast.attackBonus, mods.bonus, mods), cast.rng);
  const natural = attack.terms[0]!.value;
  const crit = natural === 20 || (mods.autoCrit && natural !== 1 && attack.total >= target.sheet.ac);
  const hit = crit || (natural !== 1 && attack.total >= target.sheet.ac);
  return { attack, hit, crit };
}

/** Attack roll and/or save: whether the spell lands in full, or for half damage. */
function landing(cast: Cast, target: CastSide, used: UsedEffect[]) {
  const { spell, rng } = cast;
  const attack = spell.attack && !spell.autoHit ? spellAttack(cast, target, used) : undefined;
  const save = spell.save ? rollSave(target.sheet, spell.save.ability, cast.dc, rng) : undefined;
  const landed = (attack?.hit ?? true) && !save?.success;
  const half = save?.success === true && spell.save?.onSave === 'half';
  return { attack, save, landed, half };
}

function oneTarget(cast: Cast, target: CastSide, used: UsedEffect[]): CastResult {
  const { spell } = cast;
  const base = { target: target.token.id, damage: 0, parts: [], hp: target.sheet.hp };
  if (spell.creatureTypes && !spell.creatureTypes.includes(target.sheet.type)) return { ...base, immune: true };
  if (spell.heal) return heal(cast, target, base);
  const { attack, save, landed, half } = landing(cast, target, used);
  const rolls = cast.shared ?? rollDamage(spell.damage, attack?.crit === true, cast.rng);
  const damaged = landed || half ? dealt(target.sheet, rolls, half) : undefined;
  return {
    ...base,
    ...(attack && { attack: attack.attack, hit: attack.hit, crit: attack.crit }),
    save,
    ...damaged,
    effect: landed ? effectFor(cast) : undefined,
    push: landed ? spell.push : undefined,
  };
}

function heal(cast: Cast, target: CastSide, base: Pick<CastResult, 'target' | 'damage' | 'parts' | 'hp'>): CastResult {
  const healing = roll(cast.spell.heal!, cast.rng).total + (cast.spell.healMod ? cast.mod : 0);
  const hp = Math.min(target.sheet.maxHp, target.sheet.hp + Math.max(0, healing));
  return { ...base, healed: hp - target.sheet.hp, hp, effect: effectFor(cast) };
}

/**
 * Rolls a spell against its targets. Beams and repeated targets are rolled
 * one after another, each seeing the damage dealt before it.
 */
export function resolveCast(input: CastInput, rng: Rng = Math.random): CastOutcome {
  const { caster, slot, gridSize } = input;
  const book = caster.sheet.caster;
  const mod = book ? abilityMod(caster.sheet.abilities[book.ability]) : 0;
  const cast: Cast = {
    spell: scaledSpell(input.spell, slot, book?.level ?? 1),
    caster,
    dc: book?.dc ?? 10,
    attackBonus: book?.attack ?? 0,
    mod,
    gridSize,
    rng,
  };
  if (!cast.spell.attack && cast.spell.beams === 1) cast.shared = rollDamage(cast.spell.damage, false, rng);
  const hp = new Map<string, number>();
  const used: UsedEffect[] = [];
  const results = input.targets.map((t) => {
    const now = { ...t, sheet: { ...t.sheet, hp: hp.get(t.token.id) ?? t.sheet.hp } };
    const result = oneTarget(cast, now, used);
    hp.set(t.token.id, result.hp);
    return result;
  });
  return { results, used };
}

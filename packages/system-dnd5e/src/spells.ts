import { resistSave } from './legendary.ts';
import { applyDamage, critDice, tokenDistance } from './attack.ts';
import type { Creature } from './creature.ts';
import { abilityMod } from './creature-math.ts';
import { isDead, makesDeathSaves } from './deaths.ts';
import { markDamage } from './riders.ts';
import { type Rng, roll, type Roll } from '@vtt/shared';
import { attackModifiers, d20Formula, rollSave, type SaveRoll, type UsedEffect } from './effects.ts';
import type { Token } from './token-schema.ts';
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

/** Healing, temporary hit points and hit point pools at a higher slot. */
function upcastPools(spell: Spell, extra: number): Pick<Spell, 'heal' | 'tempHp' | 'hpPool' | 'effect'> {
  const tempBonus = extra * (spell.upcast?.tempHp ?? 0);
  return {
    ...raisedMaximum(spell, extra),
    tempHp: spell.tempHp && (tempBonus ? `${spell.tempHp}+${tempBonus}` : spell.tempHp),
    hpPool: spell.hpPool && addDice(spell.hpPool, spell.upcast?.hpPool, extra),
  };
}

/** Healing, and for aid a raised maximum healed with it, at a higher slot. */
function raisedMaximum(spell: Spell, extra: number): Pick<Spell, 'heal' | 'effect'> {
  const heal = spell.heal && addDice(spell.heal, spell.upcast?.heal, extra);
  const bonus = extra * (spell.upcast?.maxHp ?? 0);
  if (!bonus || !spell.effect) return { heal, effect: spell.effect };
  return { heal: heal && `${heal}+${bonus}`, effect: { ...spell.effect, maxHp: (spell.effect.maxHp ?? 0) + bonus } };
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
    ...upcastPools(spell, extra),
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
  free,
}: {
  spell: Spell;
  slot: number;
  sheet: Creature;
  /** Cast without spending a slot. */
  free?: boolean;
}): string | undefined {
  const caster = sheet.caster;
  if (!caster?.spells.some((s) => s.id === spell.id)) return `doesn't know ${spell.name}`;
  if (spell.level === 0) return undefined;
  if (slot < spell.level || slot > 9) return `needs a slot of ${ORDINAL[spell.level]} level or higher`;
  if (!free && !caster.left[slot - 1]) return `has no ${ORDINAL[slot]}-level slots left`;
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
  /** The scene has no grid: distances are measured as the crow flies. */
  gridless?: boolean;
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
  /** A dying creature became stable. */
  stabilized?: boolean;
  /** Ids of the target's effects the spell ended (lesser restoration). */
  cured?: string[];
  /** A dead creature came back (revivify). */
  revived?: boolean;
  /** Temporary hit points after this result, when they changed. */
  tempHp?: number;
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
  /** Hit points the caster regains from the damage dealt (vampiric touch). */
  drained?: number;
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
  gridless?: boolean;
  rng: Rng;
}

function rollDamage(parts: readonly Damage[], crit: boolean, rng: Rng): { roll: Roll; type: DamageType }[] {
  return parts.map((d) => ({ roll: roll(crit ? critDice(d.dice) : d.dice, rng), type: d.type }));
}

function dealt(target: Creature, rolls: { roll: Roll; type: DamageType }[], half: boolean) {
  const amounts = rolls.map((r) => ({ amount: half ? Math.floor(r.roll.total / 2) : r.roll.total, type: r.type }));
  const { dealt: each, hp, tempHp } = applyDamage(target, amounts);
  const parts = rolls.map((r, i) => ({ ...r, dealt: each[i]! }));
  return { parts, hp, damage: each.reduce((s, d) => s + d, 0), ...(tempHp !== target.tempHp && { tempHp }) };
}

/** A rider spell's damage, carried by its effect instead of dealt now. */
function riderOf({ spell, caster }: Cast): Partial<Effect> | undefined {
  const damage = spell.damage.map((d) => ({ ...d, type: spell.weaponType ? ('weapon' as const) : d.type }));
  if (spell.rider === 'self') return { hitDamage: damage };
  if (spell.rider === 'mark') return { markDamage: damage, onlyFor: caster.token.id };
  return undefined;
}

function effectFor(cast: Cast): Effect | undefined {
  const { spell, caster, dc } = cast;
  if (!spell.effect && !spell.rider) return undefined;
  const { repeatSave, saveOnDamage, turnTempHp, ...template } = { ...spell.effect, ...riderOf(cast) };
  return {
    ...template,
    ...(turnTempHp !== undefined && { turnTempHp: turnTempHp === 'mod' ? cast.mod : turnTempHp }),
    id: `${spell.id}-${caster.token.id}`,
    name: template.name ?? spell.name,
    source: caster.token.id,
    concentration: spell.concentration || undefined,
    rounds: template.rounds ?? spell.rounds,
    repeatSave,
    saveOnDamage,
    save: (repeatSave || saveOnDamage) && spell.save ? { ability: spell.save.ability, dc } : undefined,
  };
}

/** Attack roll against the target: hit or miss, and one-shot effects it used. */
function spellAttack(cast: Cast, target: CastSide, used: UsedEffect[]) {
  const within5 = tokenDistance(cast.caster.token, target.token, cast.gridSize, cast.gridless) <= 5;
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
  const save = spell.save
    ? resistSave(target.sheet, rollSave(target.sheet, spell.save.ability, cast.dc, rng))
    : undefined;
  const landed = (attack?.hit ?? true) && !save?.success;
  const half = save?.success === true && spell.save?.onSave === 'half';
  return { attack, save, landed, half };
}

/** Results that need no attack or save: the wrong kind of creature, healing, temporary hit points, riders. */
function unrolled(cast: Cast, target: CastSide, base: Base): CastResult | undefined {
  const { spell } = cast;
  if (spell.creatureTypes && !spell.creatureTypes.includes(target.sheet.type)) return { ...base, immune: true };
  if (spell.heal) return heal(cast, target, base);
  if (spell.tempHp) return shield(cast, target, base);
  if (spell.rider) return { ...base, effect: effectFor(cast) };
  if (spell.stabilize) return { ...base, stabilized: true };
  if (spell.revive) return revive(target, base);
  if (spell.cures) return { ...base, cured: cured(spell, target.token) };
  return undefined;
}

/** The target's effects that impose a condition the spell cures. */
function cured(spell: Spell, token: Token): string[] | undefined {
  const ids = (token.effects ?? []).filter((e) => e.conditions?.some((c) => spell.cures?.includes(c))).map((e) => e.id);
  return ids.length ? ids : undefined;
}

/** A dead creature comes back with 1 hit point; a living or merely dying one is unchanged. */
function revive(target: CastSide, base: Base): CastResult {
  const dead = makesDeathSaves(target.token) ? isDead(target.token) : target.sheet.hp <= 0;
  return dead ? { ...base, hp: 1, revived: true } : base;
}

function oneTarget(cast: Cast, target: CastSide, used: UsedEffect[]): CastResult {
  const { spell } = cast;
  const base = { target: target.token.id, damage: 0, parts: [], hp: target.sheet.hp };
  const early = unrolled(cast, target, base);
  if (early) return early;
  const { attack, save, landed, half } = landing(cast, target, used);
  const marks = attack ? markDamage(target.sheet, cast.caster.token.id, spell.damage[0]?.type ?? 'force') : [];
  const rolls = cast.shared ?? rollDamage([...spell.damage, ...marks], attack?.crit === true, cast.rng);
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

type Base = Pick<CastResult, 'target' | 'damage' | 'parts' | 'hp'>;

function heal(cast: Cast, target: CastSide, base: Base): CastResult {
  const healing = roll(cast.spell.heal!, cast.rng).total + (cast.spell.healMod ? cast.mod : 0);
  const effect = effectFor(cast);
  // A raised maximum (aid) counts once, even when the effect is cast again.
  const before = target.token.effects?.find((e) => e.id === effect?.id)?.maxHp ?? 0;
  const max = target.sheet.maxHp + (effect?.maxHp ?? 0) - before;
  const hp = Math.min(max, target.sheet.hp + Math.max(0, healing));
  return { ...base, healed: hp - target.sheet.hp, hp, effect, cured: cured(cast.spell, target.token) };
}

/** Temporary hit points: the higher of what the target has and what the spell gives. */
function shield(
  cast: Cast,
  target: CastSide,
  base: Pick<CastResult, 'target' | 'damage' | 'parts' | 'hp'>,
): CastResult {
  const given = roll(cast.spell.tempHp!, cast.rng).total;
  return { ...base, tempHp: Math.max(target.sheet.tempHp, given), effect: effectFor(cast) };
}

/** Who a hit point pool reaches: the weakest first while the pool lasts, skipping the unconscious (2014 sleep). */
function pooled(cast: Cast, targets: readonly CastSide[]): Set<string> | undefined {
  if (!cast.spell.hpPool) return undefined;
  let pool = roll(cast.spell.hpPool, cast.rng).total;
  const reached = new Set<string>();
  const awake = targets.filter((t) => t.sheet.hp > 0 && !t.sheet.conditions.includes('unconscious'));
  for (const t of [...awake].sort((a, b) => a.sheet.hp - b.sheet.hp)) {
    if (t.sheet.hp > pool) break;
    pool -= t.sheet.hp;
    reached.add(t.token.id);
  }
  return reached;
}

/** Half the damage dealt to others, for spells that drain life. */
function drainOf(cast: Cast, results: readonly CastResult[]): number | undefined {
  if (!cast.spell.drain) return undefined;
  const dealt = results.filter((r) => r.target !== cast.caster.token.id).reduce((n, r) => n + r.damage, 0);
  return Math.floor(dealt / 2);
}

/**
 * Rolls a spell against its targets. Beams and repeated targets are rolled
 * one after another, each seeing the damage dealt before it.
 */
export function resolveCast(input: CastInput, rng: Rng = Math.random): CastOutcome {
  const { caster, slot, gridSize, gridless } = input;
  const book = caster.sheet.caster;
  const mod = book ? abilityMod(caster.sheet.abilities[book.ability]) : 0;
  const cast: Cast = {
    spell: scaledSpell(input.spell, slot, book?.level ?? 1),
    caster,
    dc: book?.dc ?? 10,
    attackBonus: book?.attack ?? 0,
    mod,
    gridSize,
    gridless,
    rng,
  };
  if (!cast.spell.attack && cast.spell.beams === 1 && !cast.spell.rider)
    cast.shared = rollDamage(cast.spell.damage, false, rng);
  const reached = pooled(cast, input.targets);
  const hp = new Map<string, Pick<Creature, 'hp' | 'tempHp'>>();
  const used: UsedEffect[] = [];
  const results = input.targets.map((t) => {
    const now = { ...t, sheet: { ...t.sheet, ...hp.get(t.token.id) } };
    if (reached && !reached.has(t.token.id)) return { target: t.token.id, damage: 0, parts: [], hp: now.sheet.hp };
    const result = oneTarget(cast, now, used);
    hp.set(t.token.id, { hp: result.hp, tempHp: result.tempHp ?? now.sheet.tempHp });
    return result;
  });
  return { results, used, drained: drainOf(cast, results) };
}

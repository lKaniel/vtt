import { resistSave } from './legendary.ts';
import { applyDamage, critDice, tokenDistance } from './attack.ts';
import { spellHealBonus } from './class-styles.ts';
import type { Creature } from './creature.ts';
import { abilityMod } from './creature-math.ts';
import { isDead, makesDeathSaves } from './deaths.ts';
import { markDamage } from './riders.ts';
import { type GridKind, type Rng, roll, type Roll } from '@vtt/shared';
import { attackModifiers, d20Formula, rollSpellSave, type SaveRoll, type UsedEffect } from './effects.ts';
import { contest } from './checks.ts';
import { powerImmune, savingSheet, withCrowd } from './power-casts.ts';
import type { Token } from './token-schema.ts';
import type { Effect, Spell } from './spell-schema.ts';
import { dispelled, rolledRays, tierFor, tierSpell } from './spell-options.ts';

export { withAgain, withChoice } from './spell-options.ts';
export { scaledSpell } from './spell-scaling.ts';
import { CANTRIP_TIERS, scaledSpell } from './spell-scaling.ts';
import type { Damage, DamageType } from './stats-schema.ts';

// Casting a spell: what it does at the slot it's cast with, whether the
// caster may cast it, and rolling its attacks, saves, damage and healing.

/** What the log and tooltips say about a spell the GM runs by hand, or undefined when it's automated. */
export function manualNote(spell: Pick<Spell, 'automated' | 'manual'>): string | undefined {
  if (spell.automated) return undefined;
  if (!spell.manual) return 'Not automated: the GM applies it';
  return `Not automated (${spell.manual.kind}): ${spell.manual.why}`;
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
  if (spell.counter) return `casts ${spell.name} only as a reaction to another creature's spell`;
  const stopped = stoppedBy(sheet, spell);
  if (stopped) return stopped;
  if (spell.level === 0) return undefined;
  if (slot < spell.level || slot > 9) return `needs a slot of ${ORDINAL[spell.level]} level or higher`;
  if (!free && !caster.left[slot - 1]) return `has no ${ORDINAL[slot]}-level slots left`;
  return undefined;
}

/** What stops a spell being cast at all where the caster stands: silence for a spoken one, an antimagic field for any. */
export function stoppedBy(
  sheet: Pick<Creature, 'effects'>,
  spell: Pick<Spell, 'name' | 'components'>,
): string | undefined {
  if (sheet.effects.some((e) => e.antimagic)) return `can't cast ${spell.name} inside an antimagic field`;
  const hushed = sheet.effects.find((e) => e.silenced);
  if (hushed && spell.components.includes('v')) return `can't speak ${spell.name}'s words inside ${hushed.name}`;
  return undefined;
}

/** Magic can't reach the target: it stands in an antimagic field, or in a globe that stops spells this low from outside. */
function warded(cast: Cast, target: CastSide): boolean {
  const effects = target.sheet.effects;
  if (effects.some((e) => e.antimagic)) return true;
  const inside = new Set(cast.caster.sheet.effects.map((e) => e.auraFrom).filter(Boolean));
  return effects.some((e) => e.spellWard !== undefined && cast.slot <= e.spellWard && !inside.has(e.auraFrom));
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
  /** The scene's grid (default square; none: distances as the crow flies). */
  grid?: GridKind;
  /** A save DC of its own: the original caster's, for a spell another creature uses again (dragon's breath). */
  dc?: number;
  /** An attack bonus and modifier of their own: a pool feature's (pools.ts). */
  attackBonus?: number;
  mod?: number;
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
  /** The spell doesn't work on this kind of creature (or one with this many hit points). */
  immune?: boolean;
  /** The spell killed it outright (power word kill). */
  killed?: boolean;
  /** Feet the target is pushed away from the caster (negative: pulled closer). */
  push?: number;
  /** The target's ward (2024 resistance) took some of the damage and is used for this turn. */
  warded?: string;
  /** More effects it gets, besides `effect` (a crowd's fear). */
  effects?: Effect[];
  /** Its save against the crowd effect (power-casts.ts). */
  crowdSave?: SaveRoll;
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
  slot: number;
  /** What's left of a healing pool shared out among the targets (mass heal). */
  pool?: number;
  /** One damage roll shared by every target, for spells without attacks or beams. */
  shared?: { roll: Roll; type: DamageType }[];
  caster: CastSide;
  dc: number;
  /** The caster's cantrip tier: 1, then 2, 3 and 4 from levels 5, 11 and 17. */
  tier: number;
  attackBonus: number;
  mod: number;
  gridSize: number;
  grid?: GridKind;
  rng: Rng;
}

function rollDamage(parts: readonly Damage[], crit: boolean, rng: Rng, times = 1): { roll: Roll; type: DamageType }[] {
  return parts.map((d) => {
    const rolled = roll(crit ? critDice(d.dice) : d.dice, rng);
    const by = times * (d.times ?? 1);
    return { roll: by === 1 ? rolled : { ...rolled, total: Math.floor(rolled.total * by) }, type: d.type };
  });
}

function dealt(
  target: Creature,
  rolls: { roll: Roll; type: DamageType }[],
  { half, rng }: { half: boolean; rng: Rng },
) {
  const amounts = rolls.map((r) => ({ amount: half ? Math.floor(r.roll.total / 2) : r.roll.total, type: r.type }));
  const { dealt: each, hp, tempHp, warded } = applyDamage(target, amounts, rng);
  const parts = rolls.map((r, i) => ({ ...r, dealt: each[i]! }));
  return {
    parts,
    hp,
    damage: each.reduce((s, d) => s + d, 0),
    ...(tempHp !== target.tempHp && { tempHp }),
    ...(warded && { warded }),
  };
}

/** A rider spell's damage, carried by its effect instead of dealt now. */
function riderOf({ spell, caster }: Cast): Partial<Effect> | undefined {
  const damage = spell.damage.map((d) => ({ ...d, type: spell.weaponType ? ('weapon' as const) : d.type }));
  if (spell.rider === 'self') return { hitDamage: damage };
  if (spell.rider === 'mark') return { markDamage: damage, onlyFor: caster.token.id };
  return undefined;
}

/** Numbers an effect takes from its caster: the modifier for heroism, the save DC for sanctuary. */
function casterNumbers(cast: Cast, turnTempHp: Effect['turnTempHp'], sanctuary: Effect['sanctuary']): Partial<Effect> {
  return {
    ...(turnTempHp !== undefined && { turnTempHp: turnTempHp === 'mod' ? cast.mod : turnTempHp }),
    ...(sanctuary === true && { sanctuary: cast.dc }),
  };
}

/** A weapon spell's numbers for this caster: its spellcasting ability, and the die and extra damage of its cantrip tier. */
function weaponNumbers(cast: Cast, ws: Effect['weaponSpell']): Partial<Effect> {
  if (!ws) return {};
  const at = <T>(list: readonly T[] | undefined) => list?.[Math.min(cast.tier, list.length) - 1];
  const die = at(ws.dice);
  const extra = ws.extra && at(ws.extra.dice);
  const { extra: _extra, ...rest } = ws;
  return {
    weaponSpell: { ...rest, ability: ws.ability ?? cast.caster.sheet.caster?.ability, dice: die ? [die] : undefined },
    ...(extra && { hitDamage: [{ dice: extra, type: ws.extra!.type }] }),
  };
}

/** A spell another creature uses again (dragon's breath): its effect carries the spell, slot, option and the caster's DC. */
function handedOn({ spell, slot, dc }: Cast): Partial<Effect> {
  if (spell.repeatBy !== 'target') return {};
  return { repeat: { spell: spell.id, slot, ...(spell.chosen && { choice: spell.chosen }), dc } };
}

/** Damage an effect deals each turn, multiplied like the spell's own (a lingering bolt). */
function timedTurnDamage(parts: Effect['turnDamage'], times: number | undefined): Partial<Effect> {
  if (!parts || !times || times === 1) return {};
  return { turnDamage: parts.map((d) => ({ ...d, times: (d.times ?? 1) * times })) };
}

function effectFor(cast: Cast): Effect | undefined {
  const { spell, caster, dc } = cast;
  if (!spell.effect && !spell.rider) return undefined;
  const { repeatSave, saveOnDamage, turnTempHp, forCaster, ...template } = { ...spell.effect, ...riderOf(cast) };
  return {
    ...template,
    ...weaponNumbers(cast, template.weaponSpell),
    ...handedOn(cast),
    ...(forCaster && { onlyFor: caster.token.id }),
    spell: spell.id,
    slot: cast.slot,
    ...casterNumbers(cast, turnTempHp, template.sanctuary),
    id: template.hold ? `${spell.id}-${template.hold}` : `${spell.id}-${caster.token.id}`,
    name: template.name ?? spell.name,
    ...timedTurnDamage(template.turnDamage, spell.damageTimes),
    source: caster.token.id,
    concentration: spell.concentration || undefined,
    rounds: template.rounds ?? spell.rounds,
    repeatSave,
    saveOnDamage,
    save:
      (repeatSave || saveOnDamage) && spell.save ? { ability: template.saveWith ?? spell.save.ability, dc } : undefined,
  };
}

/** Attack roll against the target: hit or miss, and one-shot effects it used. */
function spellAttack(cast: Cast, target: CastSide, used: UsedEffect[]) {
  const within5 = tokenDistance(cast.caster.token, target.token, cast.gridSize, cast.grid) <= 5;
  const mods = attackModifiers(cast.caster, target, { within5 });
  used.push(...mods.used);
  const attack = roll(d20Formula(cast.attackBonus, mods.bonus, mods), cast.rng);
  const natural = attack.terms[0]!.value;
  const crit = natural === 20 || (mods.autoCrit && natural !== 1 && attack.total >= target.sheet.ac);
  const hit = crit || (natural !== 1 && attack.total >= target.sheet.ac);
  return { attack, hit, crit };
}

/** The target's save when the spell lands, against the spell's own DC or the caster's; none when it saves only later. */
function castSave(cast: Cast, target: CastSide): SaveRoll | undefined {
  const { spell, dc, rng } = cast;
  if (!spell.save?.onCast) return undefined;
  if (spell.save.contest) return contest(spell.save.ability, cast.caster, target, rng);
  const sheet = savingSheet(spell, target.sheet, spell.save.ability);
  return resistSave(target.sheet, rollSpellSave(sheet, spell.save.ability, spell.save.dc ?? dc, rng));
}

/** Attack roll and/or save: whether the spell lands in full, or for half damage. */
function landing(cast: Cast, target: CastSide, used: UsedEffect[]) {
  const { spell } = cast;
  const attack = spell.attack && !spell.autoHit ? spellAttack(cast, target, used) : undefined;
  const save = castSave(cast, target);
  const landed = (attack?.hit ?? true) && !save?.success;
  const half = save?.success === true && spell.save?.onSave === 'half';
  return { attack, save, landed, half };
}

/** Results that need no attack or save: the wrong kind of creature, healing, temporary hit points, riders. */
function unrolled(cast: Cast, target: CastSide, base: Base): CastResult | undefined {
  const { spell } = cast;
  if (warded(cast, target)) return { ...base, immune: true };
  if (powerImmune(spell, cast.caster.sheet, target.sheet)) return { ...base, immune: true };
  if (spell.heal) return heal(cast, target, base);
  if (spell.tempHp) return shield(cast, target, base);
  if (spell.rider) return { ...base, effect: effectFor(cast) };
  if (spell.stabilize) return { ...base, stabilized: true };
  if (spell.revive) return revive(target, base, spell.revive === 'full');
  if (spell.cures && !spell.save) return { ...base, cured: cured(spell, target.token), effect: effectFor(cast) };
  if (spell.dispels) return { ...base, cured: dispelled(spell, target.token, cast) };
  return undefined;
}

/** The target's effects that impose a condition the spell cures. */
function cured(spell: Spell, token: Token): string[] | undefined {
  const ids = (token.effects ?? []).filter((e) => e.conditions?.some((c) => spell.cures?.includes(c))).map((e) => e.id);
  return ids.length ? ids : undefined;
}

/** A dead creature comes back with 1 hit point, or all of them; a living or merely dying one is unchanged. */
function revive(target: CastSide, base: Base, full: boolean): CastResult {
  const dead = makesDeathSaves(target.token) ? isDead(target.token) : target.sheet.hp <= 0;
  return dead ? { ...base, hp: full ? target.sheet.maxHp : 1, revived: true } : base;
}

function oneTarget(cast: Cast, target: CastSide, used: UsedEffect[]): CastResult {
  const base = { target: target.token.id, damage: 0, parts: [], hp: target.sheet.hp };
  const early = unrolled(cast, target, base);
  if (early) return early;
  const landed = landing(cast, target, used);
  if (landed.landed && cast.spell.hpTiers) return tiered(cast, target, { base, used, save: landed.save });
  return rolled(cast, target, base, landed);
}

/** Damage, an effect and a push from a spell whose attack and save are rolled. */
function rolled(cast: Cast, target: CastSide, base: Base, { attack, save, landed, half }: Landing): CastResult {
  const { spell } = cast;
  const marks = attack ? markDamage(target.sheet, cast.caster.token.id, spell.damage[0]?.type ?? 'force') : [];
  const rolls =
    cast.shared ?? rollDamage([...spell.damage, ...marks], attack?.crit === true, cast.rng, spell.damageTimes);
  const damaged = landed || half ? dealt(target.sheet, rolls, { half, rng: cast.rng }) : undefined;
  return {
    ...base,
    ...(attack && { attack: attack.attack, hit: attack.hit, crit: attack.crit }),
    save,
    ...damaged,
    ...(landed && { effect: effectFor(cast), push: spell.push, cured: spell.cures && cured(spell, target.token) }),
  };
}

type Landing = ReturnType<typeof landing>;
type Base = Pick<CastResult, 'target' | 'damage' | 'parts' | 'hp'>;

/** A spell that works by the target's hit points: a kill, a tier's effect, or nothing above every tier. */
function tiered(
  cast: Cast,
  target: CastSide,
  { base, used, save }: { base: Base; used: UsedEffect[]; save: SaveRoll | undefined },
): CastResult {
  const tier = tierFor(cast.spell, target.sheet.hp);
  if (tier?.kill) return { ...base, save, killed: true, hp: 0 };
  if (tier)
    return { ...base, save, effect: effectFor({ ...cast, spell: { ...tierSpell(cast.spell, tier), beams: 1 } }) };
  const { hpTiers: _tiers, ...plain } = cast.spell;
  if (!plain.damage.length && !plain.effect) return { ...base, save, immune: true };
  const result = oneTarget(
    { ...cast, spell: { ...plain, save: plain.save && { ...plain.save, onCast: false } } },
    target,
    used,
  );
  return { ...result, save };
}

function heal(cast: Cast, target: CastSide, base: Base): CastResult {
  const healing = healingFor(cast, target);
  const effect = effectFor(cast);
  // A raised maximum (aid) counts once, even when the effect is cast again.
  const before = target.token.effects?.find((e) => e.id === effect?.id)?.maxHp ?? 0;
  const max = target.sheet.maxHp + (effect?.maxHp ?? 0) - before;
  const hp = Math.min(max, target.sheet.hp + Math.max(0, healing));
  return { ...base, healed: hp - target.sheet.hp, hp, effect, cured: cured(cast.spell, target.token) };
}

/** Hit points a heal gives one target: rolled, or taken from a shared pool up to what it's missing. */
function healingFor(cast: Cast, target: CastSide): number {
  if (!cast.spell.healShared) {
    const bonus = (cast.spell.healMod ? cast.mod : 0) + spellHealBonus(cast.caster.sheet, cast.spell.level);
    return roll(cast.spell.heal!, cast.rng).total + bonus;
  }
  cast.pool ??= roll(cast.spell.heal!, cast.rng).total;
  const given = Math.min(cast.pool, Math.max(0, target.sheet.maxHp - target.sheet.hp));
  cast.pool -= given;
  return given;
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

/** The numbers a cast rolls with: the spell at its slot, and the caster's DC, attack bonus, modifier and cantrip tier. */
function castOf(input: CastInput, rng: Rng): Cast {
  const { caster, slot, gridSize, grid } = input;
  const book = caster.sheet.caster;
  const level = book?.level ?? 1;
  return {
    spell: scaledSpell(input.spell, slot, level),
    slot,
    caster,
    dc: input.dc ?? book?.dc ?? 10,
    tier: 1 + CANTRIP_TIERS.filter((l) => level >= l).length,
    attackBonus: input.attackBonus ?? book?.attack ?? 0,
    mod: input.mod ?? (book ? abilityMod(caster.sheet.abilities[book.ability]) : 0),
    gridSize,
    grid,
    rng,
  };
}

/**
 * Rolls a spell against its targets. Beams and repeated targets are rolled
 * one after another, each seeing the damage dealt before it.
 */
/** The cast as it strikes one creature: once, or once for each ray it rolls (prismatic spray). */
function raysOf(cast: Cast): Cast[] {
  if (!cast.spell.rays) return [cast];
  return rolledRays(cast.spell, cast.rng).map((spell) => ({
    ...cast,
    spell: { ...spell, beams: 1 },
    shared: undefined,
  }));
}

/** One attack at the first target; on a hit the damage, rolled once, is shared out among all of them (Fractured Bolt). */
function splitCast(cast: Cast, targets: readonly CastSide[], used: UsedEffect[]): CastResult[] {
  cast.shared = rollDamage(cast.spell.damage, false, cast.rng, (cast.spell.damageTimes ?? 1) / targets.length);
  const first = oneTarget(cast, targets[0]!, used);
  if (first.hit === false) return [first];
  const rest = { ...cast, spell: { ...cast.spell, autoHit: true } };
  return [first, ...targets.slice(1).map((t) => oneTarget(rest, t, used))];
}

export function resolveCast(input: CastInput, rng: Rng = Math.random): CastOutcome {
  const cast = castOf(input, rng);
  if (cast.spell.split && input.targets.length > 1) {
    const used: UsedEffect[] = [];
    const split = splitCast(cast, input.targets, used);
    return { results: withCrowd(split, { ...input, dc: cast.dc, rng }), used };
  }
  if (!cast.spell.attack && cast.spell.beams === 1 && !cast.spell.rider)
    cast.shared = rollDamage(cast.spell.damage, false, rng, cast.spell.damageTimes);
  const reached = pooled(cast, input.targets);
  const hp = new Map<string, Pick<Creature, 'hp' | 'tempHp'>>();
  const used: UsedEffect[] = [];
  const results = input.targets.flatMap((t) => {
    if (reached && !reached.has(t.token.id)) return [{ target: t.token.id, damage: 0, parts: [], hp: t.sheet.hp }];
    return raysOf(cast).map((ray) => {
      const now = { ...t, sheet: { ...t.sheet, ...hp.get(t.token.id) } };
      const result = oneTarget(ray, now, used);
      hp.set(t.token.id, { hp: result.hp, tempHp: result.tempHp ?? now.sheet.tempHp });
      return result;
    });
  });
  const crowded = withCrowd(results, { ...input, dc: cast.dc, rng });
  return { results: crowded, used, drained: drainOf(cast, crowded) };
}

import { type Rng, roll, type Roll } from '@vtt/shared';
import type { Token } from './token-schema.ts';
import type { Condition, Effect } from './spell-schema.ts';
import type { Ability, Edition } from './stats-schema.ts';

// How spells, conditions and features change rolls, and how they end:
// counting down, being shaken off, or with the caster's concentration.

/** What the effect rules need to know about a creature. */
export interface Affected {
  effects: readonly Effect[];
  conditions: readonly Condition[];
  saves: Record<Ability, number>;
}

interface Side {
  token: Pick<Token, 'id'>;
  sheet: Affected;
}

/** An effect that did its job and should now end. */
export interface UsedEffect {
  token: string;
  effect: string;
}

export interface AttackModifiers {
  advantage: boolean;
  disadvantage: boolean;
  /** A hit is a critical hit (paralyzed or unconscious target within 5 ft). */
  autoCrit: boolean;
  /** Dice added to the roll, e.g. bless. */
  bonus: string[];
  used: UsedEffect[];
}

const HELPLESS: readonly Condition[] = ['blinded', 'paralyzed', 'petrified', 'restrained', 'stunned', 'unconscious'];
const HINDERED: readonly Condition[] = ['blinded', 'frightened', 'poisoned', 'prone', 'restrained'];
const CANT_ACT: readonly Condition[] = ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'];
const CRIT_CLOSE: readonly Condition[] = ['paralyzed', 'unconscious'];
const FAILS_STR_DEX: readonly Condition[] = ['paralyzed', 'petrified', 'stunned', 'unconscious'];

const hasAny = (c: Affected, list: readonly Condition[]) => c.conditions.some((x) => list.includes(x));
const anyOf = (...values: unknown[]) => values.some(Boolean);

/** Effects on the attacker that change its own roll. */
function attackerSide(attacker: Side): Pick<AttackModifiers, 'advantage' | 'disadvantage' | 'bonus' | 'used'> {
  const { sheet, token } = attacker;
  const effects = sheet.effects.filter((e) => anyOf(e.advantage, e.disadvantage, e.attackBonus, e.endsOnAttack));
  return {
    advantage: sheet.conditions.includes('invisible') || effects.some((e) => e.advantage),
    disadvantage: hasAny(sheet, HINDERED) || effects.some((e) => e.disadvantage),
    bonus: effects.flatMap((e) => (e.attackBonus ? [e.attackBonus] : [])),
    used: effects.filter((e) => anyOf(e.once, e.endsOnAttack)).map((e) => ({ token: token.id, effect: e.id })),
  };
}

/** Effects on the target that change rolls against it. */
function targetSide(
  target: Side,
  attacker: string,
  within5: boolean,
): Pick<AttackModifiers, 'advantage' | 'disadvantage' | 'used'> {
  const { sheet, token } = target;
  const prone = sheet.conditions.includes('prone');
  const effects = sheet.effects.filter(
    (e) => anyOf(e.advantageAgainst, e.disadvantageAgainst) && (!e.onlyFor || e.onlyFor === attacker),
  );
  return {
    advantage: hasAny(sheet, HELPLESS) || (prone && within5) || effects.some((e) => e.advantageAgainst),
    disadvantage:
      sheet.conditions.includes('invisible') || (prone && !within5) || effects.some((e) => e.disadvantageAgainst),
    used: effects.filter((e) => e.once).map((e) => ({ token: token.id, effect: e.id })),
  };
}

/** Advantage, disadvantage and bonus dice for one attack, from both creatures' conditions and effects. */
export function attackModifiers(attacker: Side, target: Side, { within5 }: { within5: boolean }): AttackModifiers {
  const a = attackerSide(attacker);
  const t = targetSide(target, attacker.token.id, within5);
  return {
    advantage: a.advantage || t.advantage,
    disadvantage: a.disadvantage || t.disadvantage,
    autoCrit: within5 && hasAny(target.sheet, CRIT_CLOSE),
    bonus: a.bonus,
    used: [...a.used, ...t.used],
  };
}

export interface SaveModifiers {
  autoFail: boolean;
  advantage: boolean;
  disadvantage: boolean;
  bonus: string[];
}

export function saveModifiers(sheet: Affected, ability: Ability): SaveModifiers {
  const strDex = ability === 'str' || ability === 'dex';
  return {
    autoFail: strDex && hasAny(sheet, FAILS_STR_DEX),
    advantage: sheet.effects.some((e) => e.saveAdvantage?.includes(ability)),
    disadvantage:
      (ability === 'dex' && sheet.conditions.includes('restrained')) || sheet.effects.some((e) => e.saveDisadvantage),
    bonus: sheet.effects.flatMap((e) => (e.saveBonus ? [e.saveBonus] : [])),
  };
}

export interface SaveRoll {
  ability: Ability;
  dc: number;
  roll?: Roll;
  total: number;
  success: boolean;
}

/** "1d20+3+1d4", or "2d20kh1-1" with advantage. */
export function d20Formula(
  bonus: number,
  extra: readonly string[],
  { advantage = false, disadvantage = false },
): string {
  let die = '1d20';
  if (advantage && !disadvantage) die = '2d20kh1';
  if (disadvantage && !advantage) die = '2d20kl1';
  const flat = bonus < 0 ? `${bonus}` : `+${bonus}`;
  const dice = extra.map((d) => (d.startsWith('-') ? d : `+${d}`)).join('');
  return `${die}${flat}${dice}`;
}

export function rollSave(sheet: Affected, ability: Ability, dc: number, rng: Rng = Math.random): SaveRoll {
  const mods = saveModifiers(sheet, ability);
  if (mods.autoFail) return { ability, dc, total: 0, success: false };
  const result = roll(d20Formula(sheet.saves[ability], mods.bonus, mods), rng);
  return { ability, dc, roll: result, total: result.total, success: result.total >= dc };
}

/** Whether a creature can take actions at all. */
export function canAct(sheet: Affected): boolean {
  return !hasAny(sheet, CANT_ACT);
}

/** DC to keep concentrating after taking damage: half of it, at least 10 (and at most 30 in 2024). */
export function concentrationDc(damage: number, edition: Edition): number {
  const dc = Math.max(10, Math.floor(damage / 2));
  return edition === '2024' ? Math.min(30, dc) : dc;
}

function withEffects(token: Token, effects: Effect[]): Token {
  return { ...token, effects: effects.length ? effects : undefined };
}

/** Removes effects by id; returns the token unchanged if none matched. */
export function removeEffects(token: Token, ids: ReadonlySet<string>): Token {
  const effects = token.effects ?? [];
  const kept = effects.filter((e) => !ids.has(e.id));
  return kept.length === effects.length ? token : withEffects(token, kept);
}

/** Counts down the effects `source` made on this token; called as `source`'s turn starts. */
export function tickEffects(token: Token, source: string): Token {
  const effects = token.effects ?? [];
  const mine = (e: Effect) => (e.source ?? token.id) === source && e.rounds !== undefined;
  if (!effects.some(mine)) return token;
  const next = effects.map((e) => (mine(e) ? { ...e, rounds: e.rounds! - 1 } : e)).filter((e) => e.rounds !== 0);
  return withEffects(token, next);
}

/** What ending a caster's concentration changes: tokens that lose effects, and summons that vanish. */
export function dropConcentration(tokens: readonly Token[], caster: string): { changed: Token[]; removed: string[] } {
  const changed: Token[] = [];
  const removed: string[] = [];
  for (const t of tokens) {
    if (t.summon?.by === caster && t.summon.concentration) {
      removed.push(t.id);
      continue;
    }
    const ids = new Set((t.effects ?? []).filter((e) => e.source === caster && e.concentration).map((e) => e.id));
    let next = removeEffects(t, ids);
    if (t.id === caster && t.concentration) next = { ...next, concentration: undefined };
    if (next !== t) changed.push(next);
  }
  return { changed, removed };
}

/** Ends what damage ends (sleep) and repeats saves damage allows, with advantage (hideous laughter). */
export function afterDamage(token: Token, sheet: Affected, rng: Rng = Math.random): { token: Token; notes: string[] } {
  const notes: string[] = [];
  const ended = new Set<string>();
  for (const e of token.effects ?? []) {
    if (e.endsOnDamage) {
      ended.add(e.id);
      notes.push(`${token.name} wakes from ${e.name}`);
    } else if (e.saveOnDamage && e.save) {
      const mods = saveModifiers(sheet, e.save.ability);
      const result = roll(d20Formula(sheet.saves[e.save.ability], mods.bonus, { ...mods, advantage: true }), rng);
      if (result.total < e.save.dc) continue;
      ended.add(e.id);
      notes.push(`${token.name} shakes off ${e.name} (${result.total} vs DC ${e.save.dc})`);
    }
  }
  return { token: removeEffects(token, ended), notes };
}

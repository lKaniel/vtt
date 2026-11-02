import { type Rng, roll } from '@vtt/shared';
import { abilityMod } from './creature-math.ts';
import type { Creature } from './creature.ts';
import { srdFor } from './content.ts';
import { classOf } from './classes.ts';
import type { Effect } from './spell-schema.ts';
import type { Edition } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// Wearing down and recovering: exhaustion (the 2014 table or the 2024
// penalties) and the hit dice a character spends on short rests.

export const MAX_EXHAUSTION = 6;

/** What `level` levels of exhaustion do, as an effect on the creature. */
export function exhaustionEffect(level: number, edition: Edition): Effect {
  const base = { id: 'exhaustion', name: `Exhaustion ${level}` };
  if (level >= MAX_EXHAUSTION)
    return { ...base, name: 'Dead (exhaustion)', conditions: ['unconscious'], immobile: true };
  if (edition === '2024') {
    const minus = `-${2 * level}`;
    return { ...base, attackBonus: minus, saveBonus: minus, checkBonus: minus, speed: -5 * level };
  }
  return {
    ...base,
    checkDisadvantage: true,
    ...(level >= 2 && { speedTimes: 0.5 }),
    ...(level >= 3 && { disadvantage: true, saveDisadvantage: true }),
    ...(level >= 4 && { maxHpTimes: 0.5 }),
    ...(level >= 5 && { immobile: true }),
  };
}

/** The token's exhaustion as an effect, if it has any. */
export function exhausted(token: Pick<Token, 'exhaustion'>, edition: Edition): Effect[] {
  return token.exhaustion ? [exhaustionEffect(token.exhaustion, edition)] : [];
}

/** A long rest takes away one level. */
export function restedExhaustion(level: number | undefined): number | undefined {
  return level && level > 1 ? level - 1 : undefined;
}

export interface HitDice {
  /** Faces of the class's hit die. */
  die: number;
  total: number;
  left: number;
}

/** A class character's hit dice: one per level, of its class's die. */
export function hitDiceOf(
  token: Pick<Token, 'stats' | 'monster' | 'spent'>,
  sheet: Pick<Creature, 'edition'>,
): HitDice | undefined {
  const cls = classOf(token, srdFor(sheet.edition));
  const total = token.stats?.level;
  if (!cls || !total || token.monster) return undefined;
  return { die: cls.hitDie, total, left: Math.max(0, total - (token.spent?.hitDice ?? 0)) };
}

/** Spent hit dice after a long rest: half the total back (at least one) in 2014, all of them in 2024. */
export function restedHitDice(spent: number | undefined, total: number, edition: Edition): number | undefined {
  if (!spent || edition === '2024') return undefined;
  const back = Math.max(1, Math.floor(total / 2));
  return spent > back ? spent - back : undefined;
}

export interface HitDieSpent {
  token: Token;
  healed: number;
}

/** Rolls one hit die plus Constitution and heals that much (at least 0). Check `hitDieProblem` first. */
export function spendHitDie(token: Token, sheet: Creature, rng: Rng = Math.random): HitDieSpent {
  const dice = hitDiceOf(token, sheet)!;
  const gain = Math.max(0, roll(`1d${dice.die}`, rng).total + abilityMod(sheet.abilities.con));
  const hp = Math.min(sheet.maxHp, sheet.hp + gain);
  const spent = { ...token.spent, hitDice: (token.spent?.hitDice ?? 0) + 1 };
  return { token: { ...token, hp: hp >= sheet.maxHp ? undefined : hp, spent }, healed: hp - sheet.hp };
}

/** Why `token` can't spend a hit die now, or undefined if it can. */
export function hitDieProblem(token: Token, sheet: Creature): string | undefined {
  const dice = hitDiceOf(token, sheet);
  if (!dice) return `${token.name} has no hit dice`;
  if (!dice.left) return `${token.name} has no hit dice left`;
  if (sheet.hp >= sheet.maxHp) return `${token.name} is unhurt`;
  if (sheet.hp <= 0) return `${token.name} is down`;
  return undefined;
}

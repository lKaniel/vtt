import { roll, type Rng } from './dice.ts';
import type { Token } from './schema.ts';

// Characters at 0 hit points don't die at once: they make death saving
// throws at the start of their turns until they stabilize, wake or die.
// Monsters (tokens with a stat block) simply die at 0.

export type DeathSaves = NonNullable<Token['deathSaves']>;

/** A character, rather than a monster: it makes death saves. */
export const makesDeathSaves = (token: Pick<Token, 'monster' | 'stats'>) => !token.monster && !!token.stats;

/** At 0 hp and still rolling death saves: not stable, not dead. */
export function isDying(token: Pick<Token, 'monster' | 'stats' | 'hp' | 'deathSaves'>): boolean {
  if (!makesDeathSaves(token) || token.hp === undefined || token.hp > 0) return false;
  return !token.deathSaves?.stable && !isDead(token);
}

/** Whether the character is dead: three failed death saves, or massive damage. */
export function isDead(token: Pick<Token, 'deathSaves'>): boolean {
  return !!token.deathSaves?.dead || (token.deathSaves?.failures ?? 0) >= 3;
}

function tally(saves: DeathSaves): DeathSaves {
  if (saves.failures >= 3) return { ...saves, failures: 3, dead: true };
  if (saves.successes >= 3) return { ...saves, successes: 3, stable: true };
  return saves;
}

/** Rolls a death save: 10 or more succeeds, a 1 counts twice, a 20 wakes the character with 1 hp. */
export function deathSave(token: Token, rng: Rng = Math.random): { token: Token; note: string } {
  const d20 = roll('1d20', rng).total;
  const now = token.deathSaves ?? { successes: 0, failures: 0 };
  if (d20 === 20)
    return {
      token: { ...token, hp: 1, deathSaves: undefined },
      note: `${token.name} rolls a 20 and wakes up with 1 HP`,
    };
  const saves = tally(
    d20 >= 10 ? { ...now, successes: now.successes + 1 } : { ...now, failures: now.failures + (d20 === 1 ? 2 : 1) },
  );
  const result = d20 >= 10 ? 'success' : 'failure';
  let state = '';
  if (saves.dead) state = ' and dies';
  else if (saves.stable) state = ' and is stable';
  const count = `${saves.successes}/3 successes, ${saves.failures}/3 failures`;
  return {
    token: { ...token, deathSaves: saves },
    note: `${token.name} death save: ${d20}, ${result} (${count})${state}`,
  };
}

/**
 * A character hurt to or at 0 hp: damage at 0 is a failed death save (two on a
 * critical hit), and damage left over that reaches its max hp kills outright.
 */
export function damagedWhileDown(
  token: Token,
  { damage, crit, maxHp, hpBefore }: { damage: number; crit: boolean; maxHp: number; hpBefore: number },
): Token {
  if (!makesDeathSaves(token) || damage <= 0) return token;
  const now = token.deathSaves ?? { successes: 0, failures: 0 };
  if (damage - hpBefore >= maxHp) return { ...token, deathSaves: { ...now, dead: true } };
  if (hpBefore > 0) return token;
  return { ...token, deathSaves: tally({ ...now, stable: undefined, failures: now.failures + (crit ? 2 : 1) }) };
}

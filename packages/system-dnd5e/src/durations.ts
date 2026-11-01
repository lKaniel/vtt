import { ROUND_SECONDS } from '@vtt/shared';
import type { Token } from './token-schema.ts';
import type { Effect } from './spell-schema.ts';

// How long things last in world time (see clock.ts in shared). What a spell
// starts gets the game-clock second it ends: effects, concentration and
// summons. In a fight, effects that last rounds count down on their maker's
// turns (effects.ts tickEffects); out of one, time running out ends them.

/** A spell's duration in rounds, or undefined for one that lasts until ended. */
export type SpellRounds = (spell: string) => number | undefined;

const ends = (now: number, rounds: number | undefined) => (rounds ? now + rounds * ROUND_SECONDS : undefined);

function stampEffect(e: Effect, now: number): Effect {
  return e.endsAt === undefined && e.rounds ? { ...e, endsAt: ends(now, e.rounds) } : e;
}

/** Gives what lasts on the token and has no end time yet an end time, counted from `now`. */
export function stampDurations(token: Token, now: number, rounds: SpellRounds): Token {
  let next = token;
  const effects = token.effects?.map((e) => stampEffect(e, now));
  if (effects?.some((e, i) => e !== token.effects![i])) next = { ...next, effects };
  const c = token.concentration;
  const cEnds = c && c.endsAt === undefined ? ends(now, rounds(c.spell)) : undefined;
  if (c && cEnds !== undefined) next = { ...next, concentration: { ...c, endsAt: cEnds } };
  const s = token.summon;
  const sEnds = s && s.endsAt === undefined ? ends(now, rounds(s.spell)) : undefined;
  if (s && sEnds !== undefined) next = { ...next, summon: { ...s, endsAt: sEnds } };
  return next;
}

/**
 * Ends the token's effects whose time is up at `now`. In a fight, effects
 * counted in rounds are left to the turns.
 */
export function expireEffects(token: Token, now: number, inFight: boolean): { token: Token; ended: Effect[] } {
  const effects = token.effects ?? [];
  const over = (e: Effect) => e.endsAt !== undefined && e.endsAt <= now && !(inFight && e.rounds !== undefined);
  const ended = effects.filter(over);
  if (!ended.length) return { token, ended };
  const kept = effects.filter((e) => !over(e));
  return { token: { ...token, effects: kept.length ? kept : undefined }, ended };
}

/** The rounds each timed effect has left at `now`, as a fight starts. */
export function roundsLeft(token: Token, now: number): Token {
  const effects = token.effects ?? [];
  const left = (e: Effect) => Math.max(1, Math.ceil((e.endsAt! - now) / ROUND_SECONDS));
  const next = effects.map((e) => (e.rounds !== undefined && e.endsAt !== undefined ? { ...e, rounds: left(e) } : e));
  return next.some((e, i) => e.rounds !== effects[i]!.rounds) ? { ...token, effects: next } : token;
}

/** Whether the token's concentration, or the spell that summoned it, has run out at `now`. */
export function lastingEnds(token: Token, now: number): { concentration: boolean; summon: boolean } {
  const past = (at: number | undefined) => at !== undefined && at <= now;
  return { concentration: past(token.concentration?.endsAt), summon: past(token.summon?.endsAt) };
}

/** The earliest end time among the tokens' effects, concentration and summons. */
export function nextEnd(tokens: Iterable<Token>): number | undefined {
  let soonest: number | undefined;
  const see = (at: number | undefined) => {
    if (at !== undefined && (soonest === undefined || at < soonest)) soonest = at;
  };
  for (const t of tokens) {
    for (const e of t.effects ?? []) see(e.endsAt);
    see(t.concentration?.endsAt);
    see(t.summon?.endsAt);
  }
  return soonest;
}

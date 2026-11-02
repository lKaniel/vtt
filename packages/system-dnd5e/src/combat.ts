import { z } from 'zod';
import { type Rng, roll } from '@vtt/shared';

// Initiative order and whose turn it is. Stored as combat.json in the world
// folder while a fight is on, so it survives restarts and can be edited.

export const TurnBudgetSchema = z.object({
  /** Feet of movement left this turn. */
  move: z.number().nonnegative(),
  action: z.boolean(),
  bonus: z.boolean(),
  /** Attacks left from an Attack action already begun (extra attack). */
  attacks: z.number().int().nonnegative().default(0),
  /** Once-a-turn things already done, e.g. "sneak-attack". */
  used: z.array(z.string()).default([]),
});
export type TurnBudget = z.infer<typeof TurnBudgetSchema>;

export const CombatSchema = z.object({
  round: z.number().int().positive().default(1),
  /** Index into `order` of the creature whose turn it is. */
  turn: z.number().int().nonnegative().default(0),
  order: z.array(z.object({ token: z.string(), initiative: z.number() })).min(1),
  left: TurnBudgetSchema,
  /** Creatures that used their reaction since their last turn started. */
  reacted: z.array(z.string()).default([]),
  /** Budgets of creatures acting on the current turn alongside it (summons, companions). */
  side: z.record(z.string(), TurnBudgetSchema).default({}),
  /** Turn-based mode outside a fight: the party takes turns, and no one is fighting. */
  peaceful: z.boolean().optional(),
  /** BG3's shared party turns: party members next to each other in the order act on one turn. */
  shared: z.boolean().optional(),
  /** On a shared turn, the party members acting alongside the current one (budgets in `side`). */
  group: z.array(z.string()).optional(),
  /** On a shared turn, those who have ended theirs. */
  done: z.array(z.string()).optional(),
});
export type Combat = z.infer<typeof CombatSchema>;

export interface Combatant {
  token: string;
  /** Initiative bonus. */
  bonus: number;
  speed: number;
}

/** What the turn order needs to know about a token when its turn comes up. */
export type TurnInfo = (token: string) => { speed: number; active: boolean; party?: boolean } | undefined;

export function freshTurn(speed: number): TurnBudget {
  return { move: speed, action: true, bonus: true, attacks: 0, used: [] };
}

/** Rolls initiative for everyone and starts round 1. */
export function startCombat(fighters: readonly Combatant[], rng: Rng = Math.random): Combat {
  const rolled = fighters.map((f) => ({ ...f, initiative: roll('1d20', rng).total + f.bonus }));
  rolled.sort((a, b) => b.initiative - a.initiative || b.bonus - a.bonus);
  const order = rolled.map(({ token, initiative }) => ({ token, initiative }));
  return { round: 1, turn: 0, order, left: freshTurn(rolled[0]?.speed ?? 0), side: {}, reacted: [] };
}

export function currentTurn(combat: Combat): string | undefined {
  return combat.order[combat.turn]?.token;
}

/**
 * Passes the turn to the next creature that can act, skipping those that are
 * down or gone. A new round starts after the last one.
 */
export function nextTurn(combat: Combat, info: TurnInfo): Combat {
  return advance(combat, lastOfTurn(combat) + 1, info);
}

/** The fight's first turn: the first creature that can act, with the party members sharing it. */
export function firstTurn(combat: Combat, info: TurnInfo): Combat {
  return advance(combat, 0, info);
}

/** Moves the turn to `start` or the first creature after it that can act. */
function advance(combat: Combat, start: number, info: TurnInfo): Combat {
  const n = combat.order.length;
  for (let step = 0; step < n; step++) {
    const index = start + step;
    const entry = combat.order[index % n]!;
    const who = info(entry.token);
    if (!who?.active) continue;
    const round = combat.round + Math.floor(index / n);
    const reacted = combat.reacted.filter((id) => id !== entry.token);
    const { group: _g, done: _d, ...rest } = combat;
    const next = { ...rest, round, turn: index % n, left: freshTurn(who.speed), side: {}, reacted };
    return withGroup(next, info);
  }
  return combat;
}

/** On a shared fight, a party member's turn takes in the party members right after it. */
function withGroup(combat: Combat, info: TurnInfo): Combat {
  if (!combat.shared || !info(currentTurn(combat) ?? '')?.party) return combat;
  const group: string[] = [];
  for (const entry of combat.order.slice(combat.turn + 1)) {
    const who = info(entry.token);
    if (!who?.party) break;
    if (who.active) group.push(entry.token);
  }
  return group.length ? { ...combat, group } : combat;
}

/** The order index of the turn's last creature: past the members sharing it. */
function lastOfTurn(combat: Combat): number {
  const indexes = (combat.group ?? []).map((id) => combat.order.findIndex((e) => e.token === id));
  return Math.max(combat.turn, ...indexes);
}

/** A shared turn without a member who left. */
function withoutMember(combat: Combat, token: string): Combat {
  const { group, done, ...rest } = combat;
  const left = group?.filter((t) => t !== token);
  const ended = done?.filter((t) => t !== token);
  return { ...rest, ...(left?.length && { group: left }), ...(ended?.length && { done: ended }) };
}

/** Everyone taking the current turn: its creature and the party members sharing it. */
export function takers(combat: Combat): string[] {
  const current = currentTurn(combat);
  return current ? [current, ...(combat.group ?? [])] : [];
}

/** Whether `token` may act now: it is its turn, or it shares the turn and hasn't ended its own. */
export function actsNow(combat: Combat, token: string): boolean {
  if (combat.done?.includes(token)) return false;
  return currentTurn(combat) === token || !!combat.group?.includes(token);
}

/** `tokens` end their turns; a shared turn passes on once every member has ended theirs. */
export function endTurns(combat: Combat, tokens: readonly string[], info: TurnInfo): Combat {
  if (!combat.group) return nextTurn(combat, info);
  const sharing = takers(combat);
  const done = [...new Set([...(combat.done ?? []), ...tokens.filter((t) => sharing.includes(t))])];
  return sharing.every((t) => done.includes(t)) ? nextTurn(combat, info) : { ...combat, done };
}

/** Rolls initiative for a creature joining a fight under way: it takes its place, and the turn stays with whoever has it. */
export function addToCombat(combat: Combat, f: Combatant, rng: Rng = Math.random): Combat {
  if (combat.order.some((e) => e.token === f.token)) return combat;
  const initiative = roll('1d20', rng).total + f.bonus;
  const at = combat.order.findIndex((e) => e.initiative < initiative);
  const index = at < 0 ? combat.order.length : at;
  const order = [...combat.order];
  order.splice(index, 0, { token: f.token, initiative });
  return { ...combat, order, turn: index <= combat.turn ? combat.turn + 1 : combat.turn };
}

/** Adds creatures to the order right after `after`, sharing its initiative (summons). */
export function joinCombat(combat: Combat, after: string, tokens: readonly string[]): Combat {
  const index = combat.order.findIndex((e) => e.token === after);
  if (index < 0) return combat;
  const initiative = combat.order[index]!.initiative;
  const order = [...combat.order];
  order.splice(index + 1, 0, ...tokens.map((token) => ({ token, initiative })));
  return { ...combat, order, turn: combat.turn > index ? combat.turn + tokens.length : combat.turn };
}

/** Takes a creature out of the order. If it was its turn, the next creature's starts. */
export function leaveCombat(combat: Combat, token: string, info: TurnInfo): Combat {
  const index = combat.order.findIndex((e) => e.token === token);
  if (index < 0) return combat;
  const order = combat.order.filter((_, i) => i !== index);
  if (index > combat.turn) return withoutMember({ ...combat, order }, token);
  if (index < combat.turn) return { ...combat, order, turn: combat.turn - 1 };
  // `index` now points at the creature after the one that left.
  return advance({ ...combat, order }, index, info);
}

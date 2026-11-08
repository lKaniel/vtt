import { gridKind, roll } from '@vtt/shared';
import {
  type CastOutcome,
  negateEffect,
  poolReactions,
  type PoolReaction,
  shielded,
  spendPool,
  tokenDistance,
  veiled,
  evadeResult,
  type WeaponAttackOutcome,
} from '@vtt/system-dnd5e';
import type { PendingHit } from '../actions/combat-actions.ts';
import { asksReactions } from './reaction-deciders.ts';
import type { Fighter, Table } from './table.ts';

// Pool reactions at the table (pool-reactions.ts in system-dnd5e): a Veil
// as an attack is about to hit, which may land the miss on someone else
// (Redirect) or turn a hit that still lands into an illusion (Unreal Self),
// and Phantom Step against spells that call for a Dexterity save.

const round = (n: number) => Math.round(n * 100) / 100;

/** The pool reactions a hit's target may take, with the names to show for them. */
export function hitGuards(hit: PendingHit): { reactions: PoolReaction[]; labels: Record<string, string> } {
  const reactions = poolReactions(hit.target, hit.attacker, 'hit');
  const unit = hit.target.sheet.pool?.name ?? '';
  const price = (r: PoolReaction) => (r.extra ? `${round(r.cost)} + ${round(r.extra)}` : `${round(r.cost)}`);
  const labels = Object.fromEntries(reactions.map((r) => [r.feature.id, `${r.feature.name} (${price(r)} ${unit})`]));
  return { reactions, labels };
}

function spend(table: Table, id: string, cost: number): void {
  table.store.setToken(spendPool(table.store.tokens.get(id)!, cost));
}

/** Takes a pool reaction to a hit: pays, veils the attack, then redirects or negates it when that applies. */
export function guard(table: Table, hit: PendingHit, reaction: PoolReaction): PendingHit {
  const { target, outcome } = hit;
  const name = target.token.name;
  spend(table, target.token.id, reaction.cost);
  const second = roll('1d20', table.rng).total;
  const veil = veiled(outcome.roll, second, target.sheet.ac);
  table.note(`${name} veils: the attack rolls again (${second}) and ${veil.hit ? 'still hits' : 'misses'}`);
  const does = reaction.feature.reaction?.does;
  if (!veil.hit) return (does === 'redirect' ? redirect(table, hit, reaction) : undefined) ?? missed(hit, 'veil');
  if (does !== 'negate') return { ...hit, outcome: { ...outcome, roll: veil } };
  spend(table, target.token.id, reaction.extra);
  lostTrack(table, hit, reaction);
  table.note(`The hit strikes an illusion of ${name}`);
  return missed(hit, reaction.feature.name.toLowerCase());
}

const missed = (hit: PendingHit, note: string): PendingHit => {
  const outcome: WeaponAttackOutcome = shielded(hit.outcome);
  return { ...hit, outcome: { ...outcome, notes: [note] } };
};

/** The attack lands on the nearest other creature within 5 ft of the reactor instead, when there is one. */
function redirect(table: Table, hit: PendingHit, reaction: PoolReaction): PendingHit | undefined {
  const other = beside(table, hit);
  if (!other) return undefined;
  spend(table, hit.target.token.id, reaction.extra);
  table.note(`${hit.attacker.token.name}'s attack lands on ${other.token.name} instead`);
  return { ...hit, target: other, outcome: { ...hit.outcome, decoy: undefined } };
}

function beside(table: Table, { attacker, target }: PendingHit): Fighter | undefined {
  const { world } = table.store;
  const feet = (a: Fighter['token'], b: Fighter['token']) => tokenDistance(a, b, world.gridSize, gridKind(world));
  const near = [...table.store.tokens.values()]
    .filter((t) => t.id !== attacker.token.id && t.id !== target.token.id && (table.sheetOf(t)?.hp ?? 0) > 0)
    .filter((t) => feet(t, target.token) <= 5)
    .sort((a, b) => feet(a, target.token) - feet(b, target.token));
  return near[0] && table.fighter(near[0].id);
}

function lostTrack(table: Table, { attacker, target }: PendingHit, reaction: PoolReaction): void {
  const effect = negateEffect(reaction.feature, target.token.id, attacker.token.id);
  if (!effect) return;
  const token = table.store.tokens.get(attacker.token.id)!;
  const effects = [...(token.effects ?? []).filter((e) => e.id !== effect.id), effect];
  table.store.setToken({ ...token, effects });
}

/**
 * Phantom Step: each target of a spell that calls for a Dexterity save and
 * may react, whose player wants hit reactions, and who has the Lucidity,
 * steps out of its way: nothing on a success, half on a failure.
 */
export function stepAside(table: Table, caster: Fighter, outcome: CastOutcome): CastOutcome {
  const asks = (id: string) => asksReactions(table, table.store.tokens.get(id)!);
  const results = outcome.results.map((r) => {
    if (r.save?.ability !== 'dex' || r.damage <= 0 || !asks(r.target)) return r;
    if (table.store.combat?.reacted.includes(r.target)) return r;
    const target = table.fighter(r.target);
    const [step] = poolReactions(target, caster, 'save');
    if (!step) return r;
    table.pay(target.token, 'reaction');
    spend(table, r.target, step.cost);
    table.note(`${target.token.name} uses ${step.feature.name}`);
    return evadeResult(r, target.sheet.hp);
  });
  return { ...outcome, results };
}

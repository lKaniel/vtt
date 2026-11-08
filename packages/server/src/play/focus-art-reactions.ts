import { applyDamage, artBoost, dodge, type Effect, hitArtOf, parry, spendUse } from '@vtt/system-dnd5e';
import type { PendingHit } from '../actions/combat-actions.ts';
import type { Fighter, Table } from './table.ts';

// A focus art taken against a hit (focus-arts.ts in the system): the point
// is spent (building momentum), then the parry or dodge changes the hit.

/** The hit after the target's focus art `choice`; unchanged if it isn't one. */
export function focusArt(table: Table, hit: PendingHit, choice: string): PendingHit {
  const { token, sheet } = table.fighter(hit.target.token.id);
  const art = hitArtOf(sheet, choice);
  const feature = sheet.features.find((f) => f.id === choice);
  if (!art || !feature) return hit;
  table.store.setToken(spendUse(token, feature, 1, sheet));
  const boost = artBoost(sheet);
  if (art === 'dodge') {
    const dodged = dodge(hit.outcome, sheet, table.rng, boost.sureDodge);
    table.note(`${token.name} uses ${feature.name} and ${dodged.note}`);
    return { ...hit, outcome: dodged.outcome };
  }
  const attacker = table.fighter(hit.attacker.token.id);
  const counterAc = boost.counter ? attacker.sheet.ac : undefined;
  const parried = parry(hit.outcome, sheet, table.rng, { bonus: boost.parryBonus, counterAc });
  table.note(`${token.name} ${parried.note}`);
  if (parried.stuns) stun(table, attacker.token.id);
  if (parried.counter > 0) counterStrike(table, attacker, parried.counter, hit);
  return { ...hit, outcome: parried.outcome };
}

/** Counter Strike: what the parry blocked beyond the hit, dealt back to the attacker with the hit's damage type. */
function counterStrike(table: Table, attacker: Fighter, amount: number, hit: PendingHit): void {
  const type = hit.outcome.roll.damage[0]?.type ?? 'bludgeoning';
  const after = applyDamage(attacker.sheet, [{ amount, type }]);
  const dealt = after.dealt.reduce((n, d) => n + d, 0);
  table.hurt(attacker.token, after, dealt);
  table.note(`${attacker.token.name} takes ${dealt} damage back`);
}

/** Stunned until the start of its next turn: one round counted on its own turns. */
function stun(table: Table, id: string): void {
  const token = table.store.tokens.get(id);
  if (!token) return;
  const effect: Effect = {
    id: `parried-${id}`,
    name: 'Stunned (parried)',
    conditions: ['stunned'],
    rounds: 1,
    source: id,
  };
  table.store.setToken({ ...token, effects: [...(token.effects ?? []).filter((e) => e.id !== effect.id), effect] });
}

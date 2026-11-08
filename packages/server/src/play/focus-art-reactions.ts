import { dodge, type Effect, hitArtOf, parry, spendUse } from '@vtt/system-dnd5e';
import type { PendingHit } from '../actions/combat-actions.ts';
import type { Table } from './table.ts';

// A focus art taken against a hit (focus-arts.ts in the system): the point
// is spent (building momentum), then the parry or dodge changes the hit.

/** The hit after the target's focus art `choice`; unchanged if it isn't one. */
export function focusArt(table: Table, hit: PendingHit, choice: string): PendingHit {
  const { token, sheet } = table.fighter(hit.target.token.id);
  const art = hitArtOf(sheet, choice);
  const feature = sheet.features.find((f) => f.id === choice);
  if (!art || !feature) return hit;
  table.store.setToken(spendUse(token, feature, 1, sheet));
  if (art === 'dodge') {
    const dodged = dodge(hit.outcome, sheet, table.rng);
    table.note(`${token.name} uses ${feature.name} and ${dodged.note}`);
    return { ...hit, outcome: dodged.outcome };
  }
  const parried = parry(hit.outcome, sheet, table.rng);
  table.note(`${token.name} ${parried.note}`);
  if (parried.stuns) stun(table, hit.attacker.token.id);
  return { ...hit, outcome: parried.outcome };
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

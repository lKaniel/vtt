import { applyDamage, withGravity } from '@vtt/system-dnd5e';
import { roll } from '@vtt/shared';
import type { Table } from './table.ts';

// Creatures a spell lifted (reverse gravity) rise while it lasts and fall
// when it ends: 1d6 bludgeoning per 10 ft, at most 20d6.

/** Raises or drops every token to what its effects lift it now, hurting the ones that fall. */
export function keepGravity(table: Table): void {
  for (const token of [...table.store.tokens.values()]) {
    const next = withGravity(token);
    if (!next) continue;
    table.store.setToken(next.token);
    if (next.fell) fall(table, next.token.id, next.fell);
  }
}

function fall(table: Table, id: string, feet: number): void {
  const token = table.store.tokens.get(id)!;
  const sheet = table.sheetOf(token);
  const dice = Math.min(20, Math.floor(feet / 10));
  if (!sheet || dice < 1) return;
  const amount = roll(`${dice}d6`, table.rng).total;
  const { dealt, hp, tempHp, warded } = applyDamage(sheet, [{ amount, type: 'bludgeoning' }], table.rng);
  const total = dealt.reduce((n, d) => n + d, 0);
  table.note(`${token.name} falls ${feet} ft and takes ${total} bludgeoning damage`);
  if (total > 0) table.hurt(token, { hp, tempHp, warded }, total);
}

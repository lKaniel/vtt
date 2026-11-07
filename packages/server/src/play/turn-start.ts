import type { Table } from './table.ts';

// What a creature's turn brings it as it starts, beyond its own effects
// counting down: aura of life picking it up from 0 hit points.

/** Aura of life: a creature at 0 hit points in it regains 1 as its turn starts, and stops dying. */
export function riseInAura(table: Table, id: string): void {
  const token = table.store.tokens.get(id);
  const sheet = token && table.sheetOf(token);
  if (!token || !sheet || sheet.hp > 0 || token.deathSaves?.dead || !sheet.effects.some((e) => e.lifeline)) return;
  table.store.setToken({ ...token, hp: 1, deathSaves: undefined });
  table.note(`${token.name} regains 1 hit point`);
}

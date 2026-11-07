import type { Table } from './table.ts';

// What a creature's turn brings it as it starts, beyond its own effects
// counting down: aura of life picking it up from 0 hit points, compulsion
// walking it where its caster said.

/** Aura of life: a creature at 0 hit points in it regains 1 as its turn starts, and stops dying. */
export function riseInAura(table: Table, id: string): void {
  const token = table.store.tokens.get(id);
  const sheet = token && table.sheetOf(token);
  if (!token || !sheet || sheet.hp > 0 || token.deathSaves?.dead || !sheet.effects.some((e) => e.lifeline)) return;
  table.store.setToken({ ...token, hp: 1, deathSaves: undefined });
  table.note(`${token.name} regains 1 hit point`);
}

/** Compulsion: a creature its caster steered walks toward the point, as far as its speed takes it. */
export function compelled(table: Table, id: string): void {
  const token = table.store.tokens.get(id);
  const towards = token?.effects?.find((e) => e.towards)?.towards;
  const sheet = token && table.sheetOf(token);
  if (!towards || !sheet) return;
  const feet = table.forceMove(id, towards, -sheet.speed);
  if (feet > 0) table.note(`${token.name} is compelled to walk ${feet} ft`);
}

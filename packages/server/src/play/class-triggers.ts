import { isParty } from '@vtt/shared';
import { type Token, triggered, type TriggerOn } from '@vtt/system-dnd5e';
import type { Table } from './table.ts';

// Class features that go off when hit points change (chapters.ts in the
// system): a jaeger's Crimson Rage as it becomes bloodied, Savior's Focus
// as an ally drops. Table.hurt calls this after every hit.

/** After `id` went from `before` to its hit points now: its own triggers, and its allies'. */
export function hurtTriggers(table: Table, id: string, before: number): void {
  const token = table.store.tokens.get(id);
  const sheet = token && table.sheetOf(token);
  if (!token || !sheet) return;
  const half = sheet.maxHp / 2;
  if (before > half && sheet.hp <= half && sheet.hp > 0) fire(table, token, 'bloodied');
  if (before > 0 && sheet.hp <= 0) for (const ally of allies(table, token)) fire(table, ally, 'ally-down');
}

function allies(table: Table, token: Token): Token[] {
  return [...table.store.tokens.values()].filter(
    (t) => t.id !== token.id && isParty(t) === isParty(token) && (table.sheetOf(t)?.hp ?? 0) > 0,
  );
}

function fire(table: Table, token: Token, on: TriggerOn): void {
  const sheet = table.sheetOf(token);
  if (!sheet?.features.some((f) => f.trigger?.on === on)) return;
  const out = triggered(token, sheet, on);
  if (out.token === token) return;
  table.store.setToken(out.token);
  for (const note of out.notes) table.note(note);
}

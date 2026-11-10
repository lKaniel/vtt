import { rechargeFeatures } from '@vtt/system-dnd5e';
import type { Table } from './table.ts';

/** A monster's spent "Recharge 5-6" actions roll to come back as its turn starts. */
export function recharge(table: Table, id: string): void {
  const token = table.store.tokens.get(id);
  const sheet = token && table.sheetOf(token);
  if (!token || !sheet) return;
  const out = rechargeFeatures(token, sheet, table.rng);
  if (out.token !== token) table.store.setToken(out.token);
  for (const note of out.notes) table.note(note);
}

import { freshTurn } from '@vtt/system-dnd5e';
import type { Table } from './table.ts';

// Time stop: its caster takes turns in a row while no one else acts, until
// the turns run out or something it does affects another creature.

/** The turn of `id` starts over instead of passing on, using up one of its extra turns. True when it does. */
export function anotherTurn(table: Table, id: string | undefined): boolean {
  const { store } = table;
  const token = id ? store.tokens.get(id) : undefined;
  const stopped = token?.effects?.find((e) => e.extraTurns);
  const combat = store.combat;
  if (!token || !stopped || !combat || combat.group?.length) return false;
  const left = stopped.extraTurns! - 1;
  const effects = token.effects!.flatMap((e) => {
    if (e !== stopped) return [e];
    return left > 0 ? [{ ...e, extraTurns: left }] : [];
  });
  store.setToken({ ...token, effects: effects.length ? effects : undefined });
  const { done: _done, ...rest } = combat;
  store.setCombat({ ...rest, left: freshTurn(table.turnInfo(token.id)?.speed ?? token.speed) });
  table.note(`${token.name} takes another turn while time stands still`);
  return true;
}

/** Time stop ends once its caster affects a creature other than itself. */
export function breakTimeStop(table: Table, id: string, touched: readonly string[]): void {
  const token = table.store.tokens.get(id);
  if (!token?.effects?.some((e) => e.extraTurns) || !touched.some((t) => t !== id)) return;
  const effects = token.effects.filter((e) => !e.extraTurns);
  table.store.setToken({ ...token, effects: effects.length ? effects : undefined });
  table.note(`Time flows again around ${token.name}`);
}

import { automationOf, type Token } from '@vtt/system-dnd5e';
import { canControl, isGm, type Player } from '@vtt/shared';
import type { Table } from './table.ts';

// Who decides how a creature reacts (automation.ts settings): the player who
// controls it, else the GM.

/** Whose settings say how a creature reacts: a player who controls it, else the GM. */
export function deciderOf(table: Table, reactor: Token): Player | undefined {
  const seats = table.store.world.players.filter((p) => canControl(reactor, p));
  return seats.find((p) => !isGm(p)) ?? seats[0];
}

/** Whether a creature's player wants to be asked about reactions (hits and spells). */
export function asksReactions(table: Table, reactor: Token): boolean {
  return automationOf(deciderOf(table, reactor)?.settings).hitReactions !== 'never';
}

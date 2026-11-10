import { canControl, type Player } from '@vtt/shared';
import type { RollEdge } from '@vtt/system-dnd5e';
import { Refusal, type Table } from '../play/table.ts';

// A player's roll pick for the rolls the server makes for their creature (play/roll-picks.ts).

/** `player` picks `edge` (none: normal) for the next roll of a creature they control, down or not. */
export function pickRoll(table: Table, player: Player, token: string, edge: RollEdge | undefined): void {
  const it = table.store.tokens.get(token);
  if (!it) throw new Refusal('No such creature');
  if (!canControl(it, player)) throw new Refusal(`You don't control ${it.name}`);
  table.picks.set(token, edge, player.id);
}

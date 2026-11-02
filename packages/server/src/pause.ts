import { isGm, type Player } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { isGameAction } from './undo.ts';
import { Refusal } from './table.ts';

// The GM pausing the game, as in Foundry: while paused the players can't
// act (move, attack, cast, open doors), though they can still chat, measure
// and draw. Not saved: a restarted server is running.

export class Pause {
  on = false;

  constructor(private tellAll: (msg: ServerMessage) => void) {}

  /** GM: pause or go on. */
  set(player: Player, on: boolean): void {
    if (!isGm(player)) throw new Refusal('Only the GM can pause the game');
    if (on === this.on) return;
    this.on = on;
    this.tellAll({ t: 'paused', on });
  }

  /** Refuses a player's game action while paused. */
  check(player: Player, msg: { t: string }): void {
    if (this.on && !isGm(player) && isGameAction(msg.t)) throw new Refusal('The GM paused the game');
  }
}

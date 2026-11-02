import { randomUUID } from 'node:crypto';
import { type Player, roll, type RollMode, rollModeOf, withMode } from '@vtt/shared';
import type { ChatMessage } from '@vtt/system-dnd5e';

/**
 * Plain text, or a roll for "/r 1d20+5" in the seat's `mode`, or for one
 * roll in another ("/gmr", "/br", "/sr", "/pr": see roll-modes.ts). Throws on a bad formula.
 */
export function chatMessage(player: Player, text: string, mode: RollMode = 'public'): ChatMessage {
  const base = { id: randomUUID(), time: Date.now(), from: player.name, color: player.color, by: player.id };
  const space = text.indexOf(' ');
  const command = space > 0 ? text.slice(0, space).toLowerCase() : '';
  const rolled = rollModeOf(command, mode);
  if (!rolled) return { ...base, text };
  return withMode({ ...base, roll: roll(text.slice(space + 1)) }, rolled, player.id);
}

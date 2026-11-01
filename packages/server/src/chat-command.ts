import { randomUUID } from 'node:crypto';
import { roll, type ChatMessage, type Player } from '@vtt/shared';

const ROLL_COMMANDS = new Set(['/r', '/roll', '/gmr']);

/** Plain text, or a roll for "/r 1d20+5", "/roll ..." and the GM-only "/gmr ...". Throws on a bad formula. */
export function chatMessage(player: Player, text: string): ChatMessage {
  const base = { id: randomUUID(), time: Date.now(), from: player.name, color: player.color };
  const space = text.indexOf(' ');
  const command = space > 0 ? text.slice(0, space).toLowerCase() : '';
  if (!ROLL_COMMANDS.has(command)) return { ...base, text };
  return { ...base, roll: roll(text.slice(space + 1)), gmOnly: command === '/gmr' || undefined };
}

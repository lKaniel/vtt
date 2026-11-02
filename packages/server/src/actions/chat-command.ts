import { randomUUID } from 'node:crypto';
import { type Player, roll, type RollMode, rollModeOf, withMode } from '@vtt/shared';
import type { ChatMessage } from '@vtt/system-dnd5e';
import { signedBy } from './seat-settings.ts';

/**
 * Plain text, or a roll for "/r 1d20+5" in the seat's `mode`, or for one
 * roll in another ("/gmr", "/br", "/sr", "/pr": see roll-modes.ts). Throws on a bad formula.
 */
export function chatMessage(player: Player, text: string, mode: RollMode = 'public'): ChatMessage {
  const base = { ...signedBy(player), id: randomUUID(), time: Date.now(), by: player.id };
  const space = text.indexOf(' ');
  const command = space > 0 ? text.slice(0, space).toLowerCase() : '';
  const rolled = rollModeOf(command, mode);
  if (!rolled) return { ...base, text };
  const { formula, label } = splitLabel(text.slice(space + 1));
  return withMode({ ...base, roll: roll(formula), ...(label && { label }) }, rolled, player.id);
}

/** "2d6 + 1 fire" → the formula and what it is for; words after the last number or die are the label. */
function splitLabel(text: string): { formula: string; label?: string } {
  const m = /^(.*[\d)])\s+([a-z][a-z' -]*)$/i.exec(text.trim());
  return m ? { formula: m[1]!, label: m[2]!.trim().toLowerCase() } : { formula: text };
}

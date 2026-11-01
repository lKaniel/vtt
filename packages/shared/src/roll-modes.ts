import { isGm } from './permissions.ts';
import type { ChatEntry } from './protocol.ts';
import type { Player } from './schema.ts';

// Who sees a roll, as in Foundry: everyone (public), the GM and whoever
// rolled it (gm), the GM only, with the roller told just that they rolled
// (blind), or whoever rolled it only (self). Each seat picks its mode in the
// chat panel; the chat commands pick one for a single roll.

export const ROLL_MODES = ['public', 'gm', 'blind', 'self'] as const;
export type RollMode = (typeof ROLL_MODES)[number];

const COMMANDS: Record<string, RollMode | 'seat'> = {
  '/r': 'seat',
  '/roll': 'seat',
  '/pr': 'public',
  '/publicroll': 'public',
  '/gmr': 'gm',
  '/gmroll': 'gm',
  '/br': 'blind',
  '/blindroll': 'blind',
  '/sr': 'self',
  '/selfroll': 'self',
};

/** The mode a roll command rolls in (`/r` uses the seat's `mode`); undefined when it isn't a roll command. */
export function rollModeOf(command: string, mode: RollMode): RollMode | undefined {
  const picked = COMMANDS[command.toLowerCase()];
  return picked === 'seat' ? mode : picked;
}

/** `entry` as made by player `by` in `mode` (public leaves the mode off). */
export function withMode<E extends ChatEntry>(entry: E, mode: RollMode, by: string | undefined): E {
  const { mode: _mode, ...rest } = entry;
  return { ...rest, ...(by && { by }), ...(mode !== 'public' && { mode }) } as E;
}

/** What `viewer` is shown of a chat entry: all of it, only that a roll was made (a blind roll's roller), or nothing. */
export function chatFor<E extends ChatEntry>(entry: E, viewer: Pick<Player, 'id' | 'role'>): E | undefined {
  const mode = entry.mode ?? 'public';
  const mine = !!entry.by && entry.by === viewer.id;
  if (mode === 'public' || (mode === 'gm' && mine)) return entry;
  if (mode === 'self') return mine ? entry : undefined;
  if (isGm(viewer)) return entry;
  return mode === 'blind' && mine ? hidden(entry) : undefined;
}

/** Every field a system adds to a card is optional, so the bare entry is one of `E`. */
function hidden<E extends ChatEntry>({ id, time, from, color, by, mode }: E): E {
  return { id, time, from, color, ...(by && { by }), ...(mode && { mode }), hidden: true } as E;
}

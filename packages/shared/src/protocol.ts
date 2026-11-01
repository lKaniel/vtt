import type { Doc, Op } from '@vtt/core';
import type { Roll } from './dice.ts';
import type { Chunk, DoorState, Point, Role, World } from './schema.ts';
import type { FogEdit } from './fog-edit.ts';
import type { MapEdit } from './map-edit.ts';

// The engine's half of the wire protocol: scenes, maps, fog, documents and
// undo. A game system adds its own messages (attacks, spells, sheets) on top;
// D&D's full ClientMessage and ServerMessage are in system-dnd5e/protocol.ts.

/** World settings a client needs; the player list is replaced by `you`. */
export type WorldInfo = Omit<World, 'players'>;

/** A chat line: text or a dice roll. Systems add their own cards (an attack, a spell). */
export interface ChatEntry {
  id: string;
  time: number;
  from: string;
  color: string;
  text?: string;
  roll?: Roll;
  /** Set on GM-only messages. */
  gmOnly?: boolean;
  /** The GM undid the action this card reports. */
  undone?: boolean;
}

/** A document as it is now after a change; `doc` is missing when it was deleted. */
export interface DocChange {
  coll: string;
  id: string;
  doc?: Doc;
}

/** What Ctrl+Z and Ctrl+Shift+Z would do for you now, by name ("token edit", "move"). */
export interface HistoryState {
  undo?: string;
  redo?: string;
  /** GM only: the chat card of the latest game action, which can be undone from it. */
  card?: string;
}

/** What any client may send, whatever system its game plays. */
export type EngineClientMessage =
  /** The chunks this client's camera can see; the server streams them. */
  | { t: 'view'; chunks: string[] }
  | { t: 'move'; token: string; to: Point }
  | { t: 'door'; chunk: string; wall: string; state: DoorState }
  | { t: 'chat'; text: string }
  /** Change token fields; `null` removes one (e.g. `hp: null` heals fully). The GM may edit any token, a trusted player the ones they own. */
  | { t: 'editToken'; token: string; patch: Record<string, unknown> }
  | { t: 'deleteToken'; token: string }
  /** GM: link a token to its actor, unlink it, or save or reset an unlinked copy's changes. */
  | { t: 'relinkToken'; token: string; how: 'link' | 'unlink' | 'save' | 'reset' }
  /** GM: change what a seat may do at the table. */
  | { t: 'setRole'; player: string; role: Role }
  /** GM: draw or erase walls, doors, windows and lights. */
  | { t: 'mapEdit'; edit: MapEdit }
  /** GM: the time of day, 0 daylight to 1 pitch black. */
  | { t: 'darkness'; darkness: number }
  /**
   * GM: one edit as a transaction of document ops, all or nothing (paste,
   * cut, delete). `txn` comes back on the resulting `docs` or a `reject`.
   */
  | { t: 'ops'; txn: string; label?: string; ops: Op[] }
  /** GM: look at (and edit) another scene; the players stay where they are. */
  | { t: 'viewScene'; scene: string }
  /** GM: the game moves to this scene, and everyone with it. */
  | { t: 'activateScene'; scene: string }
  /** GM: put one seat on a scene of its own; no scene sends it back to the game's. */
  | { t: 'sendPlayer'; player: string; scene?: string }
  /** GM: reveal, hide or reset explored fog on the scene you are on (see fog-edit.ts). */
  | { t: 'fog'; edit: FogEdit }
  /** Undo your latest edit (the GM: or the latest game action); `card` undoes the action that chat card reports. */
  | { t: 'undo'; card?: string }
  | { t: 'redo' };

/** What the engine tells clients, whatever system the game plays. */
export type EngineServerMessage =
  | { t: 'chunk'; key: string; chunk: Chunk }
  /**
   * Explored fog of war on your scene: a player gets their own, the GM every
   * player's. `blocks` maps a block key to its bits (base64, "" for an empty
   * block, see fog.ts); `full` means forget the blocks not listed.
   */
  | { t: 'fog'; player: string; cell: number; blocks: Record<string, string>; full?: boolean }
  | { t: 'tokenGone'; id: string }
  | { t: 'moved'; id: string; path: Point[] }
  /** The time of day changed. */
  | { t: 'lighting'; darkness: number }
  | { t: 'error'; message: string }
  /** GM only: documents changed, by `by` (a player id; none for a hand edit of the files). */
  | { t: 'docs'; changes: DocChange[]; by?: string; txn?: string }
  /** Your `ops` transaction was refused; nothing in it was applied. */
  | { t: 'reject'; txn: string; reason: string }
  | ({ t: 'history' } & HistoryState)
  /** Your undo (or redo) went through. */
  | { t: 'undone'; label: string; redo: boolean }
  /** The GM undid (or redid) the game action these chat cards report. */
  | { t: 'chatUndone'; ids: string[]; undone: boolean };

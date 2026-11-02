import type { Doc, MediaEntry, Op, PackCompendium, PackInfo } from '@vtt/core';
import type { Roll } from './dice.ts';
import type { ClockAction } from './clock.ts';
import type { Chunk, DoorState, Player, Point, Role, World } from './schema.ts';
import type { FogEdit } from './fog-edit.ts';
import type { MapEdit } from './map-edit.ts';
import type { RollMode } from './roll-modes.ts';

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
  /** The player who made it; none for the game's own cards. */
  by?: string;
  /** Who may read it (see roll-modes.ts); none: everyone. */
  mode?: Exclude<RollMode, 'public'>;
  /** A blind roll as its roller sees it: only that it was made. */
  hidden?: boolean;
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
  /** Lay your ruler through these waypoints, shown live to everyone on your scene; none puts it away (see ruler.ts). */
  | { t: 'ruler'; points: Point[] }
  /** Where your pointer is on the map, shown live to everyone on your scene; null: it left the map. */
  | { t: 'cursor'; at: Point | null }
  /** Point out a spot to everyone on your scene; the GM may `pull` everyone's view there. */
  | { t: 'ping'; at: Point; pull?: boolean }
  /** Mark these tokens as your targets, shown to everyone on your scene who can see them; none clears them. */
  | { t: 'target'; tokens: string[] }
  /** Who sees your rolls and the cards of your actions from now on (see roll-modes.ts). */
  | { t: 'rollMode'; mode: RollMode }
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
  /** GM: start, stop or skip the game clock, set the date or change the calendar (see clock.ts). */
  | { t: 'clock'; action: ClockAction }
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
  | { t: 'redo' }
  /** GM: the packs this game may use (answered with `packs`). */
  | { t: 'packs' }
  /** GM: the pictures, sounds and videos of the game's assets and its packs (answered with `media`). */
  | { t: 'media' }
  /** GM: one compendium's documents, to copy into the game (answered with `compendium`). */
  | { t: 'compendium'; pack: string; compendium: string }
  /** GM: a file for the game's assets/uploads/, base64 (answered with `media`). */
  | { t: 'upload'; name: string; data: string }
  /** Roll on a roll table into chat (players: tables shared with them); `gmOnly` whispers the result to the GM. */
  | { t: 'rollTable'; table: string; gmOnly?: boolean }
  /** GM: share a journal entry with every player and open it (at `page`) on their screens. */
  | { t: 'showJournal'; entry: string; page?: string }
  /** Your own options for this game (see Player.settings), checked by the game's system; they replace the old ones. */
  | { t: 'seatSettings'; settings: Record<string, string> };

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
  /** Someone else on your scene laid their ruler through these waypoints; none: they put it away. */
  | { t: 'ruler'; player: string; name: string; color: string; points: Point[] }
  /** Someone else on your scene is pointing here; null: their pointer left the map. */
  | { t: 'cursor'; player: string; name: string; color: string; at: Point | null }
  /** Someone else on your scene pinged a spot; `pull`: the GM brings your view there. */
  | { t: 'ping'; player: string; name: string; color: string; at: Point; pull?: boolean }
  /** Someone else on your scene marked these tokens (those you can see) as their targets. */
  | { t: 'targets'; player: string; name: string; color: string; tokens: string[] }
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
  | { t: 'chatUndone'; ids: string[]; undone: boolean }
  /** The rules content of the game's packs (monsters, items, spells for D&D): sent on joining and when it changes. */
  | { t: 'packContent'; compendia: PackCompendium[] }
  /** GM: the packs the game may use; `problems` are packs the server couldn't read. */
  | { t: 'packs'; packs: PackInfo[]; problems: string[] }
  | { t: 'media'; entries: MediaEntry[] }
  | { t: 'compendium'; pack: string; compendium: string; docs: unknown[] }
  /** The GM shows you a journal entry: open it (at `page`). */
  | { t: 'showJournal'; entry: string; page?: string }
  /** Your seat changed without the table starting over (your settings). */
  | { t: 'you'; you: Player };

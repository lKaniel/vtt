import type { Doc, Op } from '@vtt/core';
import type { Combat } from './combat.ts';
import type { Roll } from './dice.ts';
import type { Actor, Chunk, DoorState, Player, Point, Role, World } from './schema.ts';
import type { MapEdit } from './map-edit.ts';
import type { Area } from './spell-schema.ts';
import type { Ability, DamageType, Edition } from './stats-schema.ts';
import type { TokenView } from './token-view.ts';

/** World settings a client needs; the player list is replaced by `you`. */
export type WorldInfo = Omit<World, 'players'>;

/** One attack as the chat log shows it. The target's AC and hit points stay secret. */
export interface AttackLog {
  attacker: string;
  target: string;
  /** Token ids, so the map can play the swing or shot between them. */
  attackerId: string;
  targetId: string;
  kind: 'melee' | 'ranged';
  attack: string;
  d20: Roll;
  hit: boolean;
  crit: boolean;
  /** Total damage dealt after resistances. */
  damage: number;
  parts: { roll: Roll; type: DamageType; dealt: number }[];
  /** e.g. "long range: disadvantage", "Goblin is down". */
  notes: string[];
}

/** One target's part of a spell, as the chat log shows it. */
export interface SpellTargetLog {
  target: string;
  targetId: string;
  attack?: Roll;
  hit?: boolean;
  crit?: boolean;
  save?: { ability: Ability; dc: number; total: number; success: boolean };
  damage: number;
  healed?: number;
  /** Name of the effect it left, e.g. "Hold Person". */
  effect?: string;
  immune?: boolean;
}

/** A spell as the chat log shows it. */
export interface SpellLog {
  caster: string;
  spell: string;
  /** Ids and shape the map uses to draw the spell. */
  casterId: string;
  spellId: string;
  /** The spell's first damage type, which colours it. */
  damageType?: DamageType;
  /** Spell attacks: a touch (melee) or a bolt (ranged). */
  attackKind?: 'melee' | 'ranged';
  /** Where an area or teleport was aimed. */
  point?: Point;
  area?: Area;
  /** Slot level; 0 for a cantrip. */
  slot: number;
  results: SpellTargetLog[];
  notes: string[];
}

export interface ChatMessage {
  id: string;
  time: number;
  from: string;
  color: string;
  text?: string;
  roll?: Roll;
  attack?: AttackLog;
  spell?: SpellLog;
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

/** What the GM places on the map: a monster from one edition's book, or a copy of an actor. */
export type SpawnSource = { kind: 'monster'; id: string; rules: Edition } | { kind: 'actor'; id: string };

/** A chance to react out of turn, sent to whoever controls the reactor. */
export interface ReactionOffer {
  id: string;
  reactor: string;
  target: string;
  /** "opportunity": `target` left the reactor's reach; "hit": `target`'s attack is about to hit the reactor. */
  kind: 'opportunity' | 'hit';
  /** What the reactor may do: melee attack names, or reactions to a hit ("shield", "uncanny-dodge"). */
  choices: string[];
  /** For a hit: the attack roll's total. */
  total?: number;
}

export type ClientMessage =
  /** The chunks this client's camera can see; the server streams them. */
  | { t: 'view'; chunks: string[] }
  | { t: 'move'; token: string; to: Point }
  | { t: 'door'; chunk: string; wall: string; state: DoorState }
  | { t: 'chat'; text: string }
  /** GM: roll initiative for these tokens and start a fight. */
  | { t: 'combatStart'; tokens: string[] }
  | { t: 'combatEnd' }
  | { t: 'endTurn' }
  /** `smite`: spend a slot of this level on Divine Smite if the attack hits (2014 paladin). */
  | { t: 'attack'; attacker: string; target: string; attack: string; smite?: number }
  /** `item` is the index in the token's inventory. */
  | { t: 'equip'; token: string; item: number; equipped: boolean }
  /** `targets` has one entry per target or beam; `point` aims areas, teleports and summons. */
  | {
      t: 'cast';
      caster: string;
      spell: string;
      slot: number;
      /** Cast without spending a slot. */
      free?: boolean;
      /** Use a lasting spell again, e.g. attack with the spiritual weapon. */
      repeat?: boolean;
      targets: string[];
      point?: Point;
      summon?: string;
    }
  /** `targets` and `point` aim features used like spells (bardic inspiration, turn undead). */
  | { t: 'feature'; token: string; feature: string; targets?: string[]; point?: Point }
  /** Use one of an item the token carries, by item id (drink a potion). */
  | { t: 'useItem'; token: string; item: string }
  /** Take a reaction that was offered, with this attack; no attack declines it. */
  | { t: 'react'; offer: string; choice?: string }
  | { t: 'dropConcentration'; token: string }
  /** GM: end one effect on a token. */
  | { t: 'removeEffect'; token: string; effect: string }
  /** GM: everyone listed takes a short or long rest. */
  | { t: 'rest'; tokens: string[]; kind: 'short' | 'long' }
  /** Save how a creature you control has its action bar arranged. */
  | { t: 'hotbar'; token: string; slots: (string | null)[] }
  /** Change token fields; `null` removes one (e.g. `hp: null` heals fully). The GM may edit any token, a trusted player the ones they own. */
  | { t: 'editToken'; token: string; patch: Record<string, unknown> }
  | { t: 'deleteToken'; token: string }
  /** GM: link a token to its actor, unlink it, or save or reset an unlinked copy's changes. */
  | { t: 'relinkToken'; token: string; how: 'link' | 'unlink' | 'save' | 'reset' }
  /** GM: put a new token on the map at a point (snapped to the grid). */
  | { t: 'spawn'; from: SpawnSource; at: Point; hidden?: boolean }
  /** GM: add or replace an actor in the Actors list. */
  | { t: 'saveActor'; actor: Actor }
  | { t: 'deleteActor'; actor: string }
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
  /** Undo your latest edit (the GM: or the latest game action); `card` undoes the action that chat card reports. */
  | { t: 'undo'; card?: string }
  | { t: 'redo' };

export type ServerMessage =
  | {
      t: 'welcome';
      world: WorldInfo;
      you: Player;
      tokens: TokenView[];
      chat: ChatMessage[];
      combat: Combat | null;
      /** The scene everyone is on. */
      scene: string;
      /** GM only: everyone at the table and the Actors list. */
      players?: Player[];
      actors?: Actor[];
      /** The documents you may read (the GM: all of them), by collection; `docs` messages keep it up to date. */
      docs?: Record<string, Doc[]>;
      history: HistoryState;
    }
  | { t: 'chunk'; key: string; chunk: Chunk }
  | { t: 'token'; token: TokenView }
  | { t: 'tokenGone'; id: string }
  | { t: 'moved'; id: string; path: Point[] }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'combat'; combat: Combat | null }
  /** GM only: an actor was added, changed or removed. */
  | { t: 'actor'; actor: Actor }
  | { t: 'actorGone'; id: string }
  /** The time of day changed. */
  | { t: 'lighting'; darkness: number }
  | { t: 'error'; message: string }
  /** A reaction you may take now; `reactionGone` once it's taken, declined or too late. */
  | { t: 'reactionOffer'; offer: ReactionOffer }
  | { t: 'reactionGone'; id: string }
  /** GM only: documents changed, by `by` (a player id; none for a hand edit of the files). */
  | { t: 'docs'; changes: DocChange[]; by?: string; txn?: string }
  /** Your `ops` transaction was refused; nothing in it was applied. */
  | { t: 'reject'; txn: string; reason: string }
  | ({ t: 'history' } & HistoryState)
  /** Your undo (or redo) went through. */
  | { t: 'undone'; label: string; redo: boolean }
  /** The GM undid (or redid) the game action these chat cards report. */
  | { t: 'chatUndone'; ids: string[]; undone: boolean };

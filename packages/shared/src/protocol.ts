import type { Combat } from './combat.ts';
import type { Roll } from './dice.ts';
import type { Actor, Chunk, DoorState, Player, Point, World } from './schema.ts';
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
}

/** What the GM places on the map: a monster from one edition's book, or a copy of an actor. */
export type SpawnSource = { kind: 'monster'; id: string; rules: Edition } | { kind: 'actor'; id: string };

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
  | { t: 'attack'; attacker: string; target: string; attack: string }
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
      targets: string[];
      point?: Point;
      summon?: string;
    }
  | { t: 'feature'; token: string; feature: string }
  /** Use one of an item the token carries, by item id (drink a potion). */
  | { t: 'useItem'; token: string; item: string }
  | { t: 'dropConcentration'; token: string }
  /** GM: end one effect on a token. */
  | { t: 'removeEffect'; token: string; effect: string }
  /** GM: everyone listed takes a short or long rest. */
  | { t: 'rest'; tokens: string[]; kind: 'short' | 'long' }
  /** Save how a creature you control has its action bar arranged. */
  | { t: 'hotbar'; token: string; slots: (string | null)[] }
  /** GM: change token fields; `null` removes one (e.g. `hp: null` heals fully). */
  | { t: 'editToken'; token: string; patch: Record<string, unknown> }
  | { t: 'deleteToken'; token: string }
  /** GM: put a new token on the map at a point (snapped to the grid). */
  | { t: 'spawn'; from: SpawnSource; at: Point; hidden?: boolean }
  /** GM: add or replace an actor in the Actors list. */
  | { t: 'saveActor'; actor: Actor }
  | { t: 'deleteActor'; actor: string };

export type ServerMessage =
  | {
      t: 'welcome';
      world: WorldInfo;
      you: Player;
      tokens: TokenView[];
      chat: ChatMessage[];
      combat: Combat | null;
      /** GM only: everyone at the table and the Actors list. */
      players?: Player[];
      actors?: Actor[];
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
  | { t: 'error'; message: string };

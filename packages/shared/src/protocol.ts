import type { Combat } from './combat.ts';
import type { Roll } from './dice.ts';
import type { Chunk, DoorState, Player, Point, World } from './schema.ts';
import type { DamageType } from './stats-schema.ts';
import type { TokenView } from './token-view.ts';

/** World settings a client needs; the player list is replaced by `you`. */
export type WorldInfo = Omit<World, 'players'>;

/** One attack as the chat log shows it. The target's AC and hit points stay secret. */
export interface AttackLog {
  attacker: string;
  target: string;
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

export interface ChatMessage {
  id: string;
  time: number;
  from: string;
  color: string;
  text?: string;
  roll?: Roll;
  attack?: AttackLog;
  /** Set on GM-only messages. */
  gmOnly?: boolean;
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
  | { t: 'attack'; attacker: string; target: string; attack: string }
  /** `item` is the index in the token's inventory. */
  | { t: 'equip'; token: string; item: number; equipped: boolean };

export type ServerMessage =
  | { t: 'welcome'; world: WorldInfo; you: Player; tokens: TokenView[]; chat: ChatMessage[]; combat: Combat | null }
  | { t: 'chunk'; key: string; chunk: Chunk }
  | { t: 'token'; token: TokenView }
  | { t: 'tokenGone'; id: string }
  | { t: 'moved'; id: string; path: Point[] }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'combat'; combat: Combat | null }
  | { t: 'error'; message: string };

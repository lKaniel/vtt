import type { Roll } from './dice.ts';
import type { Chunk, DoorState, Player, Point, Token, World } from './schema.ts';

/** World settings a client needs; the player list is replaced by `you`. */
export type WorldInfo = Omit<World, 'players'>;

export interface ChatMessage {
  id: string;
  time: number;
  from: string;
  color: string;
  text?: string;
  roll?: Roll;
  /** Set on GM-only messages. */
  gmOnly?: boolean;
}

export type ClientMessage =
  /** The chunks this client's camera can see; the server streams them. */
  | { t: 'view'; chunks: string[] }
  | { t: 'move'; token: string; to: Point }
  | { t: 'door'; chunk: string; wall: string; state: DoorState }
  | { t: 'chat'; text: string };

export type ServerMessage =
  | { t: 'welcome'; world: WorldInfo; you: Player; tokens: Token[]; chat: ChatMessage[] }
  | { t: 'chunk'; key: string; chunk: Chunk }
  | { t: 'token'; token: Token }
  | { t: 'tokenGone'; id: string }
  | { t: 'moved'; id: string; path: Point[] }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'error'; message: string };

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
  | { t: 'darkness'; darkness: number };

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
  /** The time of day changed. */
  | { t: 'lighting'; darkness: number }
  | { t: 'error'; message: string }
  /** A reaction you may take now; `reactionGone` once it's taken, declined or too late. */
  | { t: 'reactionOffer'; offer: ReactionOffer }
  | { t: 'reactionGone'; id: string };

import type { Doc } from '@vtt/core';
import type {
  ChatEntry,
  EngineClientMessage,
  EngineServerMessage,
  HistoryState,
  Player,
  Point,
  Roll,
  WorldInfo,
} from '@vtt/shared';
import type { Combat } from './combat.ts';
import type { Area, Condition } from './spell-schema.ts';
import type { CompendiumDrop, SheetArea } from './sheet-drops.ts';
import type { Ability, Currency, DamageType, Edition } from './stats-schema.ts';
import type { Actor } from './token-schema.ts';
import type { TokenView } from './token-view.ts';

// D&D's messages on top of the engine's (shared protocol.ts): fights,
// attacks, spells, features, reactions, creature sheets and the chat cards
// that report them.

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
  /** The animation the attacker picked for this attack (animations.ts); missing plays the default. */
  animation?: string;
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
  /** The animation the caster picked for this spell; missing plays the default. */
  animation?: string;
}

export interface ChatMessage extends ChatEntry {
  attack?: AttackLog;
  spell?: SpellLog;
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

/** A change to what a creature carries; `item` and `into` are inventory indexes. */
export type CarryChange =
  | { kind: 'coins'; currency: Currency }
  | { kind: 'stow'; item: number; into: number | null }
  | { kind: 'attune'; item: number; on: boolean };

export type ClientMessage =
  | EngineClientMessage
  /** GM: roll initiative for these tokens and start a fight. */
  | { t: 'combatStart'; tokens: string[] }
  | { t: 'combatEnd' }
  /** GM: turn-based mode outside a fight: the party takes turns, 6 seconds a round (fights are always turn-based). */
  | { t: 'turnBased'; on: boolean }
  | { t: 'endTurn' }
  /** `smite`: spend a slot of this level on Divine Smite if the attack hits (2014 paladin). */
  | { t: 'attack'; attacker: string; target: string; attack: string; smite?: number }
  /** `item` is the index in the token's inventory. */
  | { t: 'equip'; token: string; item: number; equipped: boolean }
  /** An owner's own gear: coins, packing it into containers (`into` null takes it out), attunement. */
  | { t: 'carry'; token: string; change: CarryChange }
  /** GM: a legendary action, between other creatures' turns; `target` for one that attacks. */
  | { t: 'legendary'; token: string; option: string; target?: string }
  /** GM: the lair action of `token`'s lair, on its turn at initiative 20. */
  | { t: 'lair'; token: string; action: string }
  /** Spends one hit die to heal (outside fights). */
  | { t: 'hitDie'; token: string }
  /** GM: sets a creature's exhaustion, 0 for none. */
  | { t: 'exhaustion'; token: string; level: number }
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
      /** Read it from a spell scroll the caster carries: no slot, the scroll's DC, and the scroll is used up. */
      scroll?: boolean;
      targets: string[];
      point?: Point;
      summon?: string;
      /** The spell's option: a damage type, enlarge or reduce (see Spell `choices`). */
      choice?: string;
    }
  /** `targets` and `point` aim features used like spells (bardic inspiration, turn undead). */
  | { t: 'feature'; token: string; feature: string; targets?: string[]; point?: Point }
  /** Use one of an item the token carries, by item id (drink a potion). */
  | { t: 'useItem'; token: string; item: string }
  /** Take a reaction that was offered, with this attack; no attack declines it. */
  | { t: 'react'; offer: string; choice?: string }
  /** Put a condition on a creature you control, or take it off (the token HUD). */
  | { t: 'condition'; token: string; condition: Condition; on: boolean }
  /** GM: add a creature to the fight (starting one) or take it out. */
  | { t: 'combatant'; token: string; on: boolean }
  /** Apply the roll on a chat card to these creatures: in full, half, double, or as healing. */
  | { t: 'applyDamage'; card: string; tokens: string[]; how: 'full' | 'half' | 'double' | 'heal' }
  | { t: 'dropConcentration'; token: string }
  /** GM: end one effect on a token. */
  | { t: 'removeEffect'; token: string; effect: string }
  /** GM: everyone listed takes a short or long rest. */
  | { t: 'rest'; tokens: string[]; kind: 'short' | 'long' }
  /** Save how a creature you control has its action bar arranged. */
  | { t: 'hotbar'; token: string; slots: (string | null)[] }
  /** Picks the animation for one of a creature's attacks or spells (`ref` "attack:<name>" or "spell:<id>"); none plays the default. */
  | { t: 'animation'; token: string; ref: string; animation?: string }
  /** Something from the Compendium dropped on a sheet (a token's or, for the GM, an actor's) you may edit. */
  | { t: 'drop'; what: CompendiumDrop; onto: { kind: 'token' | 'actor'; id: string }; area?: SheetArea }
  /** Hand the stack of an item a creature you control carries (a scroll: of that spell) to a creature you see. */
  | { t: 'give'; from: string; to: string; item: string; spell?: string }
  /** GM: put a new token on the map at a point (snapped to the grid). */
  | { t: 'spawn'; from: SpawnSource; at: Point; hidden?: boolean }
  /** GM: add or replace an actor in the Actors list. */
  | { t: 'saveActor'; actor: Actor }
  | { t: 'deleteActor'; actor: string };

export type ServerMessage =
  | EngineServerMessage
  | {
      t: 'welcome';
      world: WorldInfo;
      you: Player;
      tokens: TokenView[];
      chat: ChatMessage[];
      combat: Combat | null;
      /** The scene you are on, and its name. */
      scene: string;
      sceneName?: string;
      /** The scene the game is on (where the party plays unless the GM sent someone elsewhere). */
      active: string;
      /** GM only: everyone at the table and the Actors list. */
      players?: Player[];
      actors?: Actor[];
      /** The documents you may read (the GM: all of them), by collection; `docs` messages keep it up to date. */
      docs?: Record<string, Doc[]>;
      history: HistoryState;
      /** The server's clock (ms) as it sent this, so the game clock reads the same everywhere. */
      serverTime?: number;
      /** The GM paused the game: players can't act. */
      paused?: boolean;
    }
  | { t: 'token'; token: TokenView }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'combat'; combat: Combat | null }
  /** GM only: an actor was added, changed or removed. */
  | { t: 'actor'; actor: Actor }
  | { t: 'actorGone'; id: string }
  /** A reaction you may take now; `reactionGone` once it's taken, declined or too late. */
  | { t: 'reactionOffer'; offer: ReactionOffer }
  | { t: 'reactionGone'; id: string };

import { HOUR, type Player } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import type { ClientMessage } from './client-messages.ts';
import type { Client } from '../game-client.ts';
import { streamChunks } from '../game-client.ts';
import type { GameStore } from '../store/game-store.ts';
import type { ChatLog } from '../chat-log.ts';
import type { CombatActions } from './combat-actions.ts';
import type { DamageActions } from './damage-actions.ts';
import type { EntryActions } from './entry-actions.ts';
import { castFeature } from '../play/feature-casting.ts';
import type { FeatureActions } from './feature-actions.ts';
import type { FogKeeper } from '../play/fog-keeper.ts';
import type { GmActions } from './gm-actions.ts';
import type { HudActions } from './hud-actions.ts';
import type { MapActions } from './map-actions.ts';
import type { Reactions } from '../play/reactions.ts';
import type { SceneActions } from './scene-actions.ts';
import { checkAction, sheetAction } from './sheet-actions.ts';
import type { SpellActions } from './spell-actions.ts';
import type { Table } from '../play/table.ts';
import type { TokenMoves } from '../play/token-moves.ts';
import type { WorldClock } from '../play/world-clock.ts';

// Where each client message goes. Game (game.ts) runs every message that is
// a step of the game through this table, inside one undo step; the few it
// handles itself (document ops, undo and redo, pause, presence, packs) are
// left out. The table names every other message kind, so a new message
// can't be added to client-messages.ts without saying who handles it.

/** Messages Game handles before the table: no undo step, or no step at all. */
type Outside = 'ops' | 'undo' | 'redo' | 'pause' | 'ruler' | 'cursor' | 'ping' | 'target' | 'rollMode';
type Packs = 'packs' | 'plugins' | 'media' | 'compendium' | 'upload';
type Kind = Exclude<ClientMessage['t'], Outside | Packs>;
type Message<K extends Kind> = Extract<ClientMessage, { t: K }>;
/** A message that is a step of the game. */
export type Step = Message<Kind>;

/** Who sent a message: their connection and seat, and the tokens they can see. */
export interface Sender {
  client: Client;
  player: Player;
  canSee: (id: string) => boolean;
  reply: (msg: ServerMessage) => void;
}

type Route<K extends Kind> = (from: Sender, msg: Message<K>) => void;
export type Routes = { [K in Kind]: Route<K> };

/** The parts of the game the routes hand messages to. */
export interface GameParts {
  store: GameStore;
  table: Table;
  chat: ChatLog<Client>;
  moves: TokenMoves;
  combat: CombatActions;
  spells: SpellActions;
  features: FeatureActions;
  reactions: Reactions;
  clock: WorldClock;
  gm: GmActions;
  map: MapActions;
  fog: FogKeeper;
  scenes: SceneActions;
  entries: EntryActions;
  damage: DamageActions;
  hud: HudActions;
  /** Chat a client typed: a refused command goes back to that client only. */
  onChat: (c: Client, text: string) => void;
}

/** One route for several message kinds handled the same way. */
function each<K extends Kind>(kinds: readonly K[], route: Route<K>): { [P in K]: Route<P> } {
  return Object.fromEntries(kinds.map((k) => [k, route])) as unknown as { [P in K]: Route<P> };
}

/** Walking, doors and triggers, chat, and the fight's turns and attacks. */
function tableRoutes(p: GameParts) {
  return {
    view: (s, m) => streamChunks(s.client, m.chunks, p.store, s.reply),
    move: (s, m) => p.moves.move(s.player, s.canSee, m.token, m.to),
    ...each(['door', 'trigger'], (s, m) => p.moves.use(s.player, s.canSee, m)),
    changeLevel: (s, m) => p.moves.changeLevel(s.player, s.canSee, m.token, m.level),
    chat: (s, m) => p.onChat(s.client, m.text.trim()),
    combatStart: (s, m) => p.combat.start(s.player, m.tokens, m.shared),
    combatEnd: (s) => p.combat.end(s.player),
    endTurn: (s) => p.combat.endTurn(s.player),
    attack: (s, m) => p.combat.attack(s.player, s.canSee, m),
    ...each(['turnBased', 'legendary', 'lair'], (s, m) => p.combat.turnAction(s.player, s.canSee, m)),
    applyDamage: (s, m) => p.damage.apply(s.player, s.canSee, m),
    ...each(['condition', 'combatant'], (s, m) => p.hud.handle(s.player, s.canSee, m)),
  } satisfies Partial<Routes>;
}

/** Spells, features, items, reactions, effects and rests. */
function magicRoutes(p: GameParts) {
  return {
    cast: (s, m) => p.spells.cast(s.player, s.canSee, m),
    feature: (s, m) => {
      if (p.features.aimed(m.token, m.feature)) castFeature(p, s.player, s.canSee, m);
      else p.features.use(s.player, m.token, m.feature);
    },
    useItem: (s, m) => p.features.useItem(s.player, m.token, m.item),
    react: (s, m) => p.reactions.react(s.player, m.offer, m.choice),
    dropConcentration: (s, m) => p.features.dropConcentration(s.player, m.token),
    removeEffect: (s, m) => p.features.removeEffect(s.player, m.token, m.effect),
    rest: (s, m) => {
      p.features.rest(s.player, m.tokens, m.kind);
      p.clock.skip(m.kind === 'long' ? 8 * HOUR : HOUR);
    },
  } satisfies Partial<Routes>;
}

/** Character sheets: gear, hit dice, awards, checks, and drops onto sheets. */
function sheetRoutes(p: GameParts) {
  return {
    ...each(['equip', 'carry', 'hitDie', 'exhaustion', 'awardXp'], (s, m) => sheetAction(p.table, s.player, m)),
    ...each(['requestCheck', 'rollCheck'], (s, m) => checkAction(p.table, p.chat, s.player, m)),
    ...each(['drop', 'give', 'trade'], (s, m) => p.gm.drops.handle(s.player, s.canSee, m)),
  } satisfies Partial<Routes>;
}

/** The GM's tools: tokens, actors, seats, the map and its fog. */
function gmRoutes(p: GameParts) {
  return {
    editToken: (s, m) => p.gm.edit(s.player, m.token, m.patch),
    deleteToken: (s, m) => p.gm.delete(s.player, m.token),
    relinkToken: (s, m) => p.gm.relink(s.player, m.token, m.how),
    ...each(['hotbar', 'animation'], (s, m) => p.moves.arrange(s.player, s.canSee, m)),
    spawn: (s, m) => p.gm.spawn(s.player, m.from, m.at, m.hidden),
    saveActor: (s, m) => p.gm.saveActor(s.player, m.actor),
    deleteActor: (s, m) => p.gm.deleteActor(s.player, m.actor),
    setRole: (s, m) => p.gm.setRole(s.player, m.player, m.role),
    mapEdit: (s, m) => p.map.edit(s.player, m.edit),
    darkness: (s, m) => p.map.darkness(s.player, m.darkness),
    fog: (s, m) => p.fog.edit(s.player, m.edit),
    clock: (s, m) => p.clock.act(s.player, m.action),
  } satisfies Partial<Routes>;
}

/** Scenes, seats and settings, and the game's entries: journals, tables, macros, cards. */
function sceneRoutes(p: GameParts) {
  return {
    ...each(['viewScene', 'activateScene', 'sendPlayer', 'seatSettings', 'gameSettings', 'profile'], (s, m) =>
      p.scenes.dispatch(s.player, m),
    ),
    ...each(
      [
        'rollTable',
        'showJournal',
        'showImage',
        'runMacro',
        'drawCards',
        'passCards',
        'shuffleCards',
        'dealCards',
        'resetCards',
      ],
      (s, m) => p.entries.handle(s.client, m),
    ),
  } satisfies Partial<Routes>;
}

/** Every message that is a step of the game, and where it goes. */
export function gameRoutes(p: GameParts): Routes {
  return { ...tableRoutes(p), ...magicRoutes(p), ...sheetRoutes(p), ...gmRoutes(p), ...sceneRoutes(p) };
}

/** Hands `msg` to its route. */
export function route(routes: Routes, from: Sender, msg: Step): void {
  // Each kind's route takes that kind's message; TypeScript can't follow the pairing through the lookup.
  (routes[msg.t] as (from: Sender, msg: Step) => void)(from, msg);
}

import { type HistoryState, isGm, type Player, type WorldInfo } from '@vtt/shared';
import type { ChatMessage, ServerMessage, Token, TokenView } from '@vtt/system-dnd5e';
import type { DocFeed } from './doc-feed.ts';
import type { GameStore } from './game-store.ts';
import { packContent } from './game-packs.ts';
import { withoutSettings } from './seat-settings.ts';

// What a client is sent when it joins, or starts over because its seat,
// scene or the game's settings changed (see Game.onWorld).

/** What of a connected client its welcome depends on. */
export interface Joining {
  player: Player;
  scene: string;
  /** Tokens it may see. */
  visible: Set<string>;
  feed: DocFeed;
}

/** Everything a welcome depends on, short of the documents: when it changes, the client starts over. */
export function startOf(store: GameStore, c: Joining): string {
  // The time of day changes without starting over (a `lighting` message).
  const { players, darkness: _darkness, ...world } = store.inScene(c.scene, () => store.world);
  // The GM's welcome lists the seats too.
  const seats = isGm(c.player) ? players.map(withoutSettings) : undefined;
  const parts = [
    c.scene,
    store.activeScene,
    withoutSettings(c.player),
    world,
    store.sceneName(c.scene),
    seats,
    store.campaign.packs,
  ];
  return JSON.stringify(parts);
}

export interface WelcomeParts {
  chat: readonly ChatMessage[];
  history: HistoryState;
  view: (token: Token, player: Player) => TokenView;
  /** The server's time (ms), for the game clock. */
  now: number;
}

/** The welcome, then the rules content of the game's packs. */
export function welcomeOf(store: GameStore, c: Joining, parts: WelcomeParts): ServerMessage[] {
  const { players: _players, ...world } = store.inScene(c.scene, () => store.world);
  const info: WorldInfo = world;
  const player = c.player;
  const gm = isGm(player);
  const tokens = store.inScene(c.scene, () => [...c.visible].map((id) => store.tokens.get(id)!));
  const welcome: ServerMessage = {
    t: 'welcome',
    world: info,
    you: player,
    tokens: tokens.map((t) => parts.view(t, player)),
    chat: parts.chat.filter((m) => !m.gmOnly || gm),
    combat: store.combat ?? null,
    scene: c.scene,
    sceneName: store.sceneName(c.scene),
    active: store.activeScene,
    history: parts.history,
    docs: c.feed.start(player),
    serverTime: parts.now,
    ...(gm ? { players: store.world.players, actors: [...store.actors.values()] } : {}),
  };
  return [welcome, { t: 'packContent', compendia: packContent(store) }];
}

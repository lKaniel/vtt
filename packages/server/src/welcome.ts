import { chatFor, type HistoryState, isGm, type Player, type PartFloors, type WorldInfo } from '@vtt/shared';
import type { ChatMessage, ServerMessage, Token, TokenView } from '@vtt/system-dnd5e';
import type { DocFeed } from './store/doc-feed.ts';
import type { GameStore } from './store/game-store.ts';
import { packArtOf, packContent } from './library/game-packs.ts';
import { pluginLoads } from './library/game-plugins.ts';
import { withoutSettings } from './actions/seat-settings.ts';

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
  // The time of day and the weather change without starting over (`lighting` and `weather` messages).
  const { players, darkness: _darkness, weather: _weather, ...world } = store.inScene(c.scene, () => store.world);
  // The GM's welcome lists the seats too.
  const seats = isGm(c.player) ? players.map(withoutSettings) : undefined;
  const parts = [
    c.scene,
    store.activeScene,
    withoutSettings(c.player),
    world,
    partInfo(store, c.scene),
    store.sceneName(c.scene),
    seats,
    store.campaign.packs,
    store.campaign.plugins,
  ];
  return JSON.stringify(parts);
}

type PartInfo = Pick<WorldInfo, 'partBakes' | 'partFloors'>;

/** Of each scene laid on a combined scene, by the part's id: its last bake, and how its floors map when they differ; nothing on a scene without parts. */
function partInfo(store: GameStore, scene: string): PartInfo {
  const parts = store.inScene(scene, () => store.parts);
  if (!parts.length) return {};
  const partBakes: Record<string, string> = {};
  const partFloors: Record<string, PartFloors> = {};
  for (const { scene: id, floors } of parts) {
    const bake = store.docs.get('scenes', id)?.bake;
    if (typeof bake === 'string') partBakes[id] = bake;
    if (floors) partFloors[id] = floors;
  }
  return Object.keys(partFloors).length ? { partBakes, partFloors } : { partBakes };
}

export interface WelcomeParts {
  chat: readonly ChatMessage[];
  history: HistoryState;
  view: (token: Token, player: Player) => TokenView;
  /** The server's time (ms), for the game clock. */
  now: number;
  paused: boolean;
}

/** The welcome, then the rules content of the game's packs. */
export function welcomeOf(store: GameStore, c: Joining, parts: WelcomeParts): ServerMessage[] {
  const { players: _players, ...world } = store.inScene(c.scene, () => store.world);
  const info: WorldInfo = { ...world, ...partInfo(store, c.scene) };
  const player = c.player;
  const gm = isGm(player);
  const tokens = store.inScene(c.scene, () => [...c.visible].map((id) => store.tokens.get(id)!));
  const welcome: ServerMessage = {
    t: 'welcome',
    world: info,
    you: player,
    tokens: tokens.map((t) => parts.view(t, player)),
    chat: parts.chat.flatMap((m) => chatFor(m, player) ?? []),
    combat: store.combat ?? null,
    scene: c.scene,
    sceneName: store.sceneName(c.scene),
    active: store.activeScene,
    history: parts.history,
    docs: c.feed.start(player),
    serverTime: parts.now,
    plugins: pluginLoads(store.plugins, store.campaign),
    ...(parts.paused && { paused: true }),
    ...(gm ? { players: store.world.players, actors: [...store.actors.values()] } : {}),
  };
  return [welcome, { t: 'packContent', compendia: packContent(store), art: packArtOf(store) }];
}

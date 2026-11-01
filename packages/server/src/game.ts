import { randomUUID } from 'node:crypto';
import { canControl, isGm, type Player, type Point, type Rng, tokensVisibleTo, type World } from '@vtt/shared';
import { type ChatMessage, type ServerMessage, type Token, viewToken } from '@vtt/system-dnd5e';
import { OpError } from '@vtt/core';
import type { WebSocket } from 'ws';
import { parseClientMessage, type ClientMessage } from './client-messages.ts';
import { CombatActions } from './combat-actions.ts';
import { FeatureActions } from './feature-actions.ts';
import { GmActions } from './gm-actions.ts';
import { castFeature } from './feature-casting.ts';
import { MapActions } from './map-actions.ts';
import { SpellActions } from './spell-actions.ts';
import { Reactions } from './reactions.ts';
import { Zones } from './zones.ts';
import { DocFeed } from './doc-feed.ts';
import { checkOps } from './op-permissions.ts';
import { Refusal, Table } from './table.ts';
import type { GameStore } from './game-store.ts';
import { History } from './undo.ts';
import { SceneActions, sceneOf } from './scene-actions.ts';
import { FogKeeper } from './fog-keeper.ts';
import { chatMessage } from './chat-command.ts';
import { TokenMoves } from './token-moves.ts';
import { isPackMessage, PackActions } from './pack-actions.ts';
import { startOf, welcomeOf } from './welcome.ts';
import { contentFor, packContent } from './game-packs.ts';

interface Client {
  ws: WebSocket;
  player: Player;
  /** The scene this client is on (see scene-actions.ts). */
  scene: string;
  /** What the client was last welcomed with, to tell when it needs a fresh welcome. */
  start: string;
  /** Chunks this client is looking at. */
  chunks: Set<string>;
  /** Tokens this client currently knows about. */
  visible: Set<string>;
  /** The documents this client has (see doc-feed.ts). */
  feed: DocFeed;
}

const CHAT_HISTORY = 200;

/**
 * The live game. Clients send intents ("move here", "open this door"); the
 * game checks them, updates the world and tells each client only what that
 * player is allowed to see.
 */
export class Game {
  private clients = new Set<Client>();
  private chat: ChatMessage[] = [];
  private combat: CombatActions;
  readonly spells: SpellActions;
  readonly table: Table;
  private zones: Zones;
  private reactions: Reactions;
  private features: FeatureActions;
  private gm: GmActions;
  private map: MapActions;
  private scenes: SceneActions;
  private fog: FogKeeper;
  private moves: TokenMoves;
  private history: History;
  private packs: PackActions;

  constructor(
    private store: GameStore,
    { rng = Math.random }: { rng?: Rng } = {},
  ) {
    const table = new Table(store, rng, (text) => this.narrate({ text }));
    this.table = table;
    this.spells = new SpellActions(table, (spell) => this.narrate({ spell }));
    this.zones = new Zones(table, this.spells);
    this.combat = new CombatActions(
      table,
      (attack) => this.narrate({ attack }),
      (id) => {
        this.reactions.clear();
        this.zones.turnStarted(id);
      },
      (hit) => this.reactions.hit(hit),
    );
    this.reactions = new Reactions(table, this.combat, (msg, reactor) => {
      for (const c of this.clients) if (canControl(reactor, c.player)) this.send(c, msg);
    });
    this.features = new FeatureActions(table);
    this.gm = new GmActions(table);
    this.map = new MapActions(table);
    this.scenes = new SceneActions(store);
    this.fog = new FogKeeper(store);
    this.moves = new TokenMoves(store, this.combat, this.zones, this.reactions);
    this.history = new History(store, (ids, undone) => this.markCards(ids, undone));
    this.packs = new PackActions(store);
    this.listen(store);
  }

  /** Passes changes in the game on to the clients that may see them. */
  private listen(store: GameStore): void {
    store.fog.on('fog', (scene, player, keys, full) => this.onFog(scene, player, keys, full));
    store.on('chunk', (key, chunk, scene) => {
      this.fog.mapChanged(scene);
      for (const c of this.on(scene)) if (c.chunks.has(key)) this.send(c, { t: 'chunk', key, chunk });
      // A door or a light changed: what everyone can see may have too.
      this.refreshAll(scene);
    });
    store.on('chunkGone', (key, scene) => {
      this.fog.mapChanged(scene);
      for (const c of this.on(scene))
        if (c.chunks.has(key)) this.send(c, { t: 'chunk', key, chunk: { tiles: [], walls: [], lights: [] } });
      this.refreshAll(scene);
    });
    store.on('token', (token, path, scene) => this.refreshAll(scene, token.id, path));
    store.on('tokenGone', (id, scene) => {
      this.combat.forget(id);
      this.refreshAll(scene);
    });
    store.on('actor', (actor) => this.toGms({ t: 'actor', actor }));
    store.on('actorGone', (id) => this.toGms({ t: 'actorGone', id }));
    store.on('combat', (combat) => {
      for (const c of this.clients) this.send(c, { t: 'combat', combat: combat ?? null });
    });
    store.on('lighting', (darkness, scene) => {
      for (const c of this.on(scene)) this.send(c, { t: 'lighting', darkness });
      this.refreshAll(scene);
    });
    store.on('world', (world) => this.onWorld(world));
    store.on('scene', () => this.onWorld(this.store.world));
    // Each client gets the documents it may read; players also keep their filtered views above.
    store.on('docs', (all, by, txn) => {
      for (const c of this.clients) {
        const changes = c.feed.changes(c.player, all);
        if (changes.length || (txn && by === c.player.id)) this.send(c, { t: 'docs', changes, by, txn });
      }
    });
  }

  /**
   * The seats, the game's settings or a scene changed: each client whose
   * seat, scene or settings differ now starts over with a fresh welcome (a
   * seat that's gone is closed).
   */
  private onWorld(world: World): void {
    for (const c of this.clients) {
      const player = world.players.find((p) => p.id === c.player.id);
      if (!player) {
        c.ws.close(4000, 'your seat is gone');
        continue;
      }
      c.player = player;
      c.scene = sceneOf(player, this.store);
      if (startOf(this.store, c) !== c.start) this.restart(c);
    }
  }

  /** Sends a client a fresh welcome; it asks for its chunks again. */
  private restart(c: Client): void {
    c.visible = this.visibleTo(c.player, c.scene);
    c.chunks = new Set();
    this.welcome(c);
  }

  /** The clients on a scene. */
  private on(scene: string): Client[] {
    return [...this.clients].filter((c) => c.scene === scene);
  }

  findPlayer(id: string): Player | undefined {
    return this.store.world.players.find((p) => p.id === id);
  }

  connect(ws: WebSocket, player: Player): void {
    const feed = new DocFeed(this.store.access);
    const scene = sceneOf(player, this.store);
    const visible = this.visibleTo(player, scene);
    const client: Client = { ws, player, scene, start: '', chunks: new Set(), visible, feed };
    this.clients.add(client);
    this.welcome(client);
    ws.on('message', (data) => {
      const msg = parseClientMessage(data);
      if (msg) this.handle(client, msg);
      else this.fail(client, 'Bad message');
    });
    ws.on('close', () => this.clients.delete(client));
    console.log(`[game] ${player.name} joined`);
  }

  /** Everything a client needs to start (or start over) with its current seat. */
  private welcome(c: Client): void {
    c.start = startOf(this.store, c);
    const player = c.player;
    const parts = { chat: this.chat, history: this.history.state(player), view: (t: Token) => this.view(t, player) };
    for (const msg of welcomeOf(this.store, c, parts)) this.send(c, msg);
    this.store.inScene(c.scene, () => {
      this.fog.explore(player);
      for (const fog of this.fog.snapshot(player)) this.send(c, { t: 'fog', ...fog, full: true });
    });
  }

  private visibleTo(player: Player, scene: string): Set<string> {
    return this.store.inScene(scene, () =>
      tokensVisibleTo(player, [...this.store.tokens.values()], {
        world: this.store.world,
        lights: this.store.lights(),
        wallsBetween: (a, b) => this.store.wallsBetween(a, b),
        perceiver: (t) => this.store.system.perceiver(t, this.store.world.rules, packContent(this.store)),
      }),
    );
  }

  /**
   * Recomputes what each client on `scene` may see and sends the difference.
   * `changed` is a token whose data changed; `path` is set when it walked.
   */
  private refreshAll(scene: string, changed?: string, path?: Point[]): void {
    for (const c of this.on(scene)) {
      const before = c.visible;
      c.visible = this.visibleTo(c.player, scene);
      const msgs = this.store.inScene(scene, () => this.visibilityChanges(c, before, changed, path));
      for (const msg of msgs) this.send(c, msg);
    }
    this.exploreOn(scene);
  }

  /** Marks what each player on `scene` sees now as explored (see fog-keeper.ts). */
  private exploreOn(scene: string): void {
    const players = new Map(this.on(scene).map((c) => [c.player.id, c.player]));
    this.store.inScene(scene, () => {
      for (const player of players.values()) this.fog.explore(player);
    });
  }

  /** Sends changed fog blocks to the player whose fog it is and to the GMs, on that scene. */
  private onFog(scene: string, player: string, keys: string[], full: boolean): void {
    const map = this.store.inScene(scene, () => this.store.fog.map(scene, player, this.fog.cell()));
    const msg: ServerMessage = { t: 'fog', player, ...map.encode(keys), ...(full ? { full } : {}) };
    for (const c of this.on(scene)) if (c.player.id === player || isGm(c.player)) this.send(c, msg);
  }

  private visibilityChanges(c: Client, before: Set<string>, changed?: string, path?: Point[]): ServerMessage[] {
    const out: ServerMessage[] = [];
    for (const id of before) if (!c.visible.has(id)) out.push({ t: 'tokenGone', id });
    for (const id of c.visible) {
      const token = this.view(this.store.tokens.get(id)!, c.player);
      if (!before.has(id)) out.push({ t: 'token', token });
      else if (id === changed) out.push(path ? { t: 'moved', id, path } : { t: 'token', token });
    }
    return out;
  }

  private view(token: Token, player: Player) {
    return viewToken(token, player, contentFor(this.store, token));
  }

  /** Runs a message on the scene the client is on. */
  private handle(c: Client, msg: ClientMessage): void {
    this.store.inScene(c.scene, () => this.handleHere(c, msg));
  }

  private handleHere(c: Client, msg: ClientMessage): void {
    if (msg.t === 'ops') return this.onOps(c, msg);
    if (isPackMessage(msg)) return this.packs.handle(c.player, msg, (reply) => this.send(c, reply));
    try {
      if (msg.t === 'undo' || msg.t === 'redo') this.onUndo(c, msg);
      else if (this.history.run(c.player, msg, () => this.dispatch(c, msg))) this.sendHistory();
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      this.fail(c, e.message);
    }
  }

  /** A transaction of document ops, each allowed by ownership: all of it, or a reject saying why not. */
  private onOps(c: Client, msg: Extract<ClientMessage, { t: 'ops' }>): void {
    try {
      checkOps(c.player, msg.ops, this.store.access);
      if (this.history.run(c.player, msg, () => this.store.applyOps(msg.ops, msg.txn))) this.sendHistory();
    } catch (e) {
      if (!(e instanceof Refusal || e instanceof OpError)) throw e;
      this.send(c, { t: 'reject', txn: msg.txn, reason: e.message });
    }
  }

  private onUndo(c: Client, msg: Extract<ClientMessage, { t: 'undo' | 'redo' }>): void {
    try {
      const redo = msg.t === 'redo';
      const label = redo ? this.history.redo(c.player) : this.history.undo(c.player, msg.card);
      this.send(c, { t: 'undone', label, redo });
    } finally {
      // A refused undo still drops the step that can't be undone.
      this.sendHistory();
    }
  }

  private sendHistory(): void {
    for (const c of this.clients) this.send(c, { t: 'history', ...this.history.state(c.player) });
  }

  /** The GM undid (or redid) the action these chat cards report. */
  private markCards(ids: string[], undone: boolean): void {
    for (const m of this.chat) if (ids.includes(m.id)) m.undone = undone || undefined;
    for (const c of this.clients) this.send(c, { t: 'chatUndone', ids, undone });
  }

  private dispatch(c: Client, msg: ClientMessage): void {
    switch (msg.t) {
      case 'view':
        return this.onView(c, msg.chunks);
      case 'move':
        return this.moves.move(c.player, (id) => c.visible.has(id), msg.token, msg.to);
      case 'door':
        return this.moves.door(c.player, msg);
      case 'chat':
        return this.onChat(c, msg.text.trim());
      case 'combatStart':
        return this.combat.start(c.player, msg.tokens);
      case 'combatEnd':
        return this.combat.end(c.player);
      case 'endTurn':
        return this.combat.endTurn(c.player);
      case 'attack':
        return this.combat.attack(c.player, (id) => c.visible.has(id), msg);
      case 'equip':
        return this.combat.equip(c.player, msg.token, msg.item, msg.equipped);
      default:
        return this.dispatchMagic(c, msg);
    }
  }

  /** The GM's tools. */
  private dispatchGm(c: Client, msg: ClientMessage): void {
    switch (msg.t) {
      case 'editToken':
        return this.gm.edit(c.player, msg.token, msg.patch);
      case 'deleteToken':
        return this.gm.delete(c.player, msg.token);
      case 'relinkToken':
        return this.gm.relink(c.player, msg.token, msg.how);
      case 'hotbar':
        return this.moves.hotbar(c.player, (id) => c.visible.has(id), msg.token, msg.slots);
      case 'spawn':
        return this.gm.spawn(c.player, msg.from, msg.at, msg.hidden);
      case 'saveActor':
        return this.gm.saveActor(c.player, msg.actor);
      case 'deleteActor':
        return this.gm.deleteActor(c.player, msg.actor);
      case 'setRole':
        return this.gm.setRole(c.player, msg.player, msg.role);
      case 'mapEdit':
        return this.map.edit(c.player, msg.edit);
      case 'darkness':
        return this.map.darkness(c.player, msg.darkness);
      default:
        return this.dispatchScenes(c, msg);
    }
  }

  /** Moving between scenes, and the fog on them. */
  private dispatchScenes(c: Client, msg: ClientMessage): void {
    if (msg.t === 'fog') this.fog.edit(c.player, msg.edit);
    else this.scenes.dispatch(c.player, msg);
  }

  /** Spells, features, effects and rests. */
  private dispatchMagic(c: Client, msg: ClientMessage): void {
    switch (msg.t) {
      case 'cast':
        return this.spells.cast(c.player, (id) => c.visible.has(id), msg);
      case 'feature':
        return this.useFeature(c, msg);
      case 'useItem':
        return this.features.useItem(c.player, msg.token, msg.item);
      case 'react':
        return this.reactions.react(c.player, msg.offer, msg.choice);
      case 'dropConcentration':
        return this.features.dropConcentration(c.player, msg.token);
      case 'removeEffect':
        return this.features.removeEffect(c.player, msg.token, msg.effect);
      case 'rest':
        return this.features.rest(c.player, msg.tokens, msg.kind);
      default:
        return this.dispatchGm(c, msg);
    }
  }

  /** Features aimed like spells go through the spell rules; the rest act on their user. */
  private useFeature(c: Client, msg: Extract<ClientMessage, { t: 'feature' }>): void {
    if (this.features.aimed(msg.token, msg.feature)) {
      return castFeature(this, c.player, (id) => c.visible.has(id), msg);
    }
    this.features.use(c.player, msg.token, msg.feature);
  }

  private onView(c: Client, chunks: string[]): void {
    const next = new Set(chunks);
    for (const key of next) {
      if (c.chunks.has(key)) continue;
      // Empty chunks are sent too, so the client knows the area is loaded.
      const chunk = this.store.chunks.get(key) ?? { tiles: [], walls: [], lights: [] };
      this.send(c, { t: 'chunk', key, chunk });
    }
    c.chunks = next;
  }

  private onChat(c: Client, text: string): void {
    if (!text) return;
    let message: ChatMessage;
    try {
      message = chatMessage(c.player, text);
    } catch (e) {
      return this.fail(c, (e as Error).message);
    }
    this.post(message, c);
  }

  /** Adds a message to the log and sends it to everyone allowed to read it. */
  private post(message: ChatMessage, sender?: Client): void {
    this.chat.push(message);
    if (this.chat.length > CHAT_HISTORY) this.chat.shift();
    for (const other of this.clients) {
      if (message.gmOnly && !isGm(other.player) && other !== sender) continue;
      this.send(other, { t: 'chat', message });
    }
  }

  /** A message from the game itself: initiative, attack results. */
  private narrate(content: Pick<ChatMessage, 'text' | 'attack' | 'spell'>): void {
    const id = randomUUID();
    this.history.noteCard(id);
    this.post({ id, time: Date.now(), from: 'Combat', color: '#c8b48a', ...content });
  }

  private toGms(msg: ServerMessage): void {
    for (const c of this.clients) if (isGm(c.player)) this.send(c, msg);
  }

  private fail(c: Client, message: string): void {
    this.send(c, { t: 'error', message });
  }

  private send(c: Client, msg: ServerMessage): void {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }
}

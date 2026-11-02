import { canControl, HOUR, isGm, type Player, type Point, type Rng, tokensVisibleTo, type World } from '@vtt/shared';
import { type ChatMessage, type ServerMessage, type Token } from '@vtt/system-dnd5e';
import { OpError } from '@vtt/core';
import type { WebSocket } from 'ws';
import { parseClientMessage, type ClientMessage } from './client-messages.ts';
import { CombatActions, isTurnMessage } from './combat-actions.ts';
import { isSheetMessage, sheetAction } from './sheet-actions.ts';
import { FeatureActions } from './feature-actions.ts';
import { GmActions } from './gm-actions.ts';
import { isDropMessage } from './sheet-drop-actions.ts';
import { DamageActions } from './damage-actions.ts';
import { HudActions, isHudMessage } from './hud-actions.ts';
import { Pause } from './pause.ts';
import { castFeature } from './feature-casting.ts';
import { MapActions } from './map-actions.ts';
import { SpellActions } from './spell-actions.ts';
import { Reactions } from './reactions.ts';
import { ZoneTemplates } from './zone-templates.ts';
import { Zones } from './zones.ts';
import { AuraKeeper } from './aura-keeper.ts';
import { DocFeed } from './doc-feed.ts';
import { checkOps } from './op-permissions.ts';
import { Refusal, Table } from './table.ts';
import type { GameStore } from './game-store.ts';
import { History } from './undo.ts';
import { SceneActions, sceneOf } from './scene-actions.ts';
import { FogKeeper } from './fog-keeper.ts';
import { actedBy, ChatLog, gameCard } from './chat-log.ts';
import { tokenMoves, type TokenMoves } from './token-moves.ts';
import { isPackMessage, PackActions } from './pack-actions.ts';
import { EntryActions, isEntryMessage } from './entry-actions.ts';
import { startOf, welcomeOf } from './welcome.ts';
import { packContent } from './game-packs.ts';
import { WorldClock } from './world-clock.ts';
import { isPresenceMessage, Presence } from './presence.ts';
import { chunkMessage, type Client, streamChunks, viewFor, visibilityChanges } from './game-client.ts';

/**
 * The live game. Clients send intents ("move here", "open this door"); the
 * game checks them, updates the world and tells each client only what that
 * player is allowed to see.
 */
export class Game {
  private clients = new Set<Client>();
  private chat = new ChatLog<Client>(
    () => this.clients,
    (c, msg) => this.send(c, msg),
  );
  private combat: CombatActions;
  readonly spells: SpellActions;
  readonly table: Table;
  private zones: Zones;
  private zoneTemplates: ZoneTemplates;
  private auras: AuraKeeper;
  private reactions: Reactions;
  private features: FeatureActions;
  private gm: GmActions;
  private map: MapActions;
  private scenes: SceneActions;
  private fog: FogKeeper;
  private moves: TokenMoves;
  private history: History;
  private packs: PackActions;
  private entries: EntryActions;
  private damage: DamageActions;
  private hud: HudActions;
  private pause = new Pause((msg) => this.clients.forEach((c) => this.send(c, msg)));
  private presence = new Presence<Client>(
    () => this.clients,
    (c, msg) => this.send(c, msg),
  );
  /** World time (see world-clock.ts). */
  readonly clock: WorldClock;
  /** The seat whose message is being handled: the cards it makes follow its roll mode. */
  private acting?: Client;

  /** `now`: the server's time in ms, which the game clock runs by. */
  constructor(
    private store: GameStore,
    { rng = Math.random, now = Date.now }: { rng?: Rng; now?: () => number } = {},
  ) {
    const table = new Table(store, rng, (text) => this.narrate({ text }));
    this.table = table;
    this.spells = new SpellActions(table, (spell) => this.narrate({ spell }));
    this.zoneTemplates = new ZoneTemplates(table);
    this.auras = new AuraKeeper(table);
    this.zones = new Zones(table, this.spells, this.zoneTemplates);
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
    const show = (entry: string, page?: string) => {
      for (const c of this.clients)
        if (!isGm(c.player)) this.send(c, { t: 'showJournal', entry, ...(page && { page }) });
    };
    const say = (text: string, gmOnly: boolean) => this.chat.post(gameCard(text, gmOnly));
    const scene = (msg: ServerMessage) => this.on(store.currentScene).forEach((c) => this.send(c, msg));
    const rules = { combat: this.combat, zones: this.zones, reactions: this.reactions };
    this.moves = tokenMoves(table, rules, { say, scene, show });
    this.history = new History(store, (ids, undone) => this.chat.undone(ids, undone));
    this.clock = new WorldClock(table, { now, step: (fn) => this.timePasses(fn) });
    this.packs = new PackActions(store);
    this.damage = new DamageActions(table, () => this.chat.all);
    this.hud = new HudActions(table, this.combat);
    this.entries = new EntryActions(store, rng, {
      post: (message) => this.chat.post(actedBy(message, this.acting)),
      show,
    });
    this.listen(store);
  }

  /** Passes changes in the game on to the clients that may see them. */
  private listen(store: GameStore): void {
    store.fog.on('fog', (scene, player, keys, full) => this.onFog(scene, player, keys, full));
    store.on('chunk', (key, chunk, scene) => {
      this.fog.mapChanged(scene);
      for (const c of this.on(scene)) if (c.chunks.has(key)) this.send(c, chunkMessage(c, key, chunk));
      // A door or a light changed: what everyone can see may have too.
      this.refreshAll(scene);
    });
    store.on('chunkGone', (key, scene) => {
      this.fog.mapChanged(scene);
      for (const c of this.on(scene)) if (c.chunks.has(key)) this.send(c, chunkMessage(c, key, undefined));
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
      if (JSON.stringify(c.player.settings) !== JSON.stringify(player.settings))
        this.send(c, { t: 'you', you: player });
      c.player = player;
      const was = c.scene;
      c.scene = sceneOf(player, this.store);
      if (was !== c.scene) this.presence.left(c, was);
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
  private on = (scene: string): Client[] => [...this.clients].filter((c) => c.scene === scene);

  findPlayer = (id: string): Player | undefined => this.store.world.players.find((p) => p.id === id);

  connect(ws: WebSocket, player: Player): void {
    const scene = sceneOf(player, this.store);
    const visible = this.visibleTo(player, scene);
    const feed = new DocFeed(this.store.access, () => client.scene);
    const client: Client = { ws, player, scene, start: '', chunks: new Set(), visible, feed };
    this.clients.add(client);
    this.welcome(client);
    ws.on('message', (data) => {
      const msg = parseClientMessage(data);
      if (msg) this.handle(client, msg);
      else this.fail(client, 'Bad message');
    });
    ws.on('close', () => {
      this.clients.delete(client);
      this.presence.left(client, client.scene);
    });
    console.log(`[game] ${player.name} joined`);
  }

  /** Everything a client needs to start (or start over) with its current seat. */
  private welcome(c: Client): void {
    c.start = startOf(this.store, c);
    const player = c.player;
    const parts = {
      chat: this.chat.all,
      history: this.history.state(player),
      view: (t: Token) => viewFor(this.store, t, player),
      now: this.clock.serverTime(),
      paused: this.pause.on,
    };
    for (const msg of welcomeOf(this.store, c, parts)) this.send(c, msg);
    this.presence.greet(c);
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
        levels: this.store.world.levels,
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
      const msgs = this.store.inScene(scene, () => visibilityChanges(this.store, c, before, { changed, path }));
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

  /** Runs a message on the scene the client is on. */
  private handle(c: Client, msg: ClientMessage): void {
    this.acting = c;
    try {
      this.store.inScene(c.scene, () => this.handleHere(c, msg));
    } finally {
      this.acting = undefined;
    }
  }

  private handleHere(c: Client, msg: ClientMessage): void {
    if (msg.t === 'ops') return this.onOps(c, msg);
    if (isPresenceMessage(msg)) return this.presence.handle(c, msg);
    if (isPackMessage(msg)) return this.packs.handle(c.player, msg, (reply) => this.send(c, reply));
    try {
      this.pause.check(c.player, msg);
      if (msg.t === 'pause') this.pause.set(c.player, msg.on);
      else if (msg.t === 'undo' || msg.t === 'redo') this.onUndo(c, msg);
      else if (this.history.run(c.player, msg, () => this.settle(() => this.dispatch(c, msg)))) this.sendHistory();
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      this.fail(c, e.message);
    }
  }

  /** Runs a step, then brings what follows from it (the clock, zone templates) in line, in the same undo step. */
  private settle(step: () => void): void {
    step();
    this.clock.settle();
    this.zoneTemplates.sync();
    this.auras.sync();
  }

  /** The clock ran on: what ran out ends, as a step the GM can undo. */
  private timePasses(fn: () => void): void {
    const gm = this.store.world.players.find(isGm)!;
    const label = { label: 'time passing', action: true };
    if (this.history.step(gm, label, () => this.settle(fn))) this.sendHistory();
  }

  /** Stops the clock's tick (the game is unloaded). */
  close = (): void => this.clock.close();

  /** A transaction of document ops, each allowed by ownership: all of it, or a reject saying why not. */
  private onOps(c: Client, msg: Extract<ClientMessage, { t: 'ops' }>): void {
    try {
      checkOps(c.player, msg.ops, this.store.access);
      if (this.history.run(c.player, msg, () => this.settle(() => this.store.applyOps(msg.ops, msg.txn))))
        this.sendHistory();
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

  private dispatch(c: Client, msg: ClientMessage): void {
    switch (msg.t) {
      case 'view':
        return streamChunks(c, msg.chunks, this.store, (msg) => this.send(c, msg));
      case 'move':
        return this.moves.move(c.player, (id) => c.visible.has(id), msg.token, msg.to);
      case 'door':
      case 'trigger':
        return this.moves.use(c.player, (id) => c.visible.has(id), msg);
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
      case 'animation':
        return this.moves.arrange(c.player, (id) => c.visible.has(id), msg);
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
    else if (msg.t === 'clock') this.clock.act(c.player, msg.action);
    else if (isTurnMessage(msg)) this.combat.turnAction(c.player, (id) => c.visible.has(id), msg);
    else if (isSheetMessage(msg)) sheetAction(this.table, c.player, msg);
    else if (isEntryMessage(msg)) this.entries.handle(c.player, msg);
    else if (msg.t === 'applyDamage') this.damage.apply(c.player, (id) => c.visible.has(id), msg);
    else if (isHudMessage(msg)) this.hud.handle(c.player, (id) => c.visible.has(id), msg);
    else if (isDropMessage(msg)) this.gm.drops.handle(c.player, (id) => c.visible.has(id), msg);
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
        this.features.rest(c.player, msg.tokens, msg.kind);
        return this.clock.skip(msg.kind === 'long' ? 8 * HOUR : HOUR);
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

  private onChat(c: Client, text: string): void {
    try {
      this.chat.say(c, text);
    } catch (e) {
      this.fail(c, (e as Error).message);
    }
  }

  /** A message from the game itself: initiative, attack results. */
  private narrate(content: Pick<ChatMessage, 'text' | 'attack' | 'spell'>): void {
    const card = actedBy({ ...gameCard(content.text ?? ''), ...content }, this.acting);
    this.history.noteCard(card.id);
    this.chat.post(card);
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

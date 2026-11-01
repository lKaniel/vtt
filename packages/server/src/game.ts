import { randomUUID } from 'node:crypto';
import {
  canControlToken,
  isGm,
  tokensVisibleTo,
  findPath,
  roll,
  editionOf,
  srdFor,
  viewToken,
  type ChatMessage,
  type Player,
  type Point,
  type Rng,
  type ServerMessage,
  type Token,
  type World,
  type WorldInfo,
} from '@vtt/shared';
import { OpError, type Doc } from '@vtt/core';
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
import { Refusal, requireGm, Table } from './table.ts';
import type { GameStore } from './game-store.ts';
import { History } from './undo.ts';

interface Client {
  ws: WebSocket;
  player: Player;
  /** Chunks this client is looking at. */
  chunks: Set<string>;
  /** Tokens this client currently knows about. */
  visible: Set<string>;
}

const CHAT_HISTORY = 200;
const ROLL_COMMANDS = new Set(['/r', '/roll', '/gmr']);
/** How far a path search may wander past the start-goal box, in squares. */
const PATH_MARGIN = 12;

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
  /** world.json minus the seats, to tell a role change from a new grid. */
  private settings: string;
  private map: MapActions;
  private history: History;

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
      for (const c of this.clients) if (canControlToken(reactor, c.player)) this.send(c, msg);
    });
    this.features = new FeatureActions(table);
    this.gm = new GmActions(table);
    this.settings = worldSettings(store.world);
    this.map = new MapActions(table);
    this.history = new History(store, (ids, undone) => this.markCards(ids, undone));
    this.listen(store);
  }

  /** Passes changes in the game on to the clients that may see them. */
  private listen(store: GameStore): void {
    store.on('chunk', (key, chunk) => {
      for (const c of this.clients) if (c.chunks.has(key)) this.send(c, { t: 'chunk', key, chunk });
      // A door or a light changed: what everyone can see may have too.
      this.refreshAll();
    });
    store.on('chunkGone', (key) => {
      for (const c of this.clients)
        if (c.chunks.has(key)) this.send(c, { t: 'chunk', key, chunk: { tiles: [], walls: [], lights: [] } });
      this.refreshAll();
    });
    store.on('token', (token, path) => this.refreshAll(token.id, path));
    store.on('tokenGone', (id) => {
      this.combat.forget(id);
      this.refreshAll();
    });
    store.on('actor', (actor) => this.toGms({ t: 'actor', actor }));
    store.on('actorGone', (id) => this.toGms({ t: 'actorGone', id }));
    store.on('combat', (combat) => {
      for (const c of this.clients) this.send(c, { t: 'combat', combat: combat ?? null });
    });
    store.on('lighting', (darkness) => {
      for (const c of this.clients) this.send(c, { t: 'lighting', darkness });
      this.refreshAll();
    });
    store.on('world', (world) => this.onWorld(world));
    // Documents are only sent as such to GMs for now; players get their filtered views above.
    store.on('docs', (changes, by, txn) => this.toGms({ t: 'docs', changes, by, txn }));
  }

  /**
   * Role and seat changes reach everyone live with a fresh welcome; anything
   * else (grid, rules) or a seat that's gone needs a reconnect.
   */
  private onWorld(world: World): void {
    const settings = worldSettings(world);
    const same = settings === this.settings;
    this.settings = settings;
    for (const c of this.clients) {
      const player = world.players.find((p) => p.id === c.player.id);
      if (!same || !player) {
        c.ws.close(4000, 'world settings changed');
        continue;
      }
      c.player = player;
      c.visible = this.visibleTo(player);
      // The client starts over and asks for its chunks again.
      c.chunks = new Set();
      this.welcome(c);
    }
  }

  findPlayer(id: string): Player | undefined {
    return this.store.world.players.find((p) => p.id === id);
  }

  connect(ws: WebSocket, player: Player): void {
    const client: Client = { ws, player, chunks: new Set(), visible: this.visibleTo(player) };
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
    const { players: _players, ...world } = this.store.world;
    const info: WorldInfo = world;
    const player = c.player;
    const gm = isGm(player);
    this.send(c, {
      t: 'welcome',
      world: info,
      you: player,
      tokens: [...c.visible].map((id) => this.view(this.store.tokens.get(id)!, player)),
      chat: this.chat.filter((m) => !m.gmOnly || gm),
      combat: this.store.combat ?? null,
      scene: this.store.activeScene,
      history: this.history.state(player),
      ...(gm
        ? { players: this.store.world.players, actors: [...this.store.actors.values()], docs: this.allDocs() }
        : {}),
    });
  }

  private allDocs(): Record<string, Doc[]> {
    const docs = this.store.docs;
    return Object.fromEntries(docs.collections().map((coll) => [coll, docs.all(coll)]));
  }

  private visibleTo(player: Player): Set<string> {
    return tokensVisibleTo(player, [...this.store.tokens.values()], {
      world: this.store.world,
      lights: this.store.lights(),
      wallsBetween: (a, b) => this.store.wallsBetween(a, b),
      monster: (t) => srdFor(editionOf(t, this.store.world)).monsters.get(t.monster ?? ''),
    });
  }

  /**
   * Recomputes what each client may see and sends the difference. `changed`
   * is a token whose data changed; `path` is set when it walked.
   */
  private refreshAll(changed?: string, path?: Point[]): void {
    for (const c of this.clients) {
      const before = c.visible;
      c.visible = this.visibleTo(c.player);
      for (const msg of this.visibilityChanges(c, before, changed, path)) this.send(c, msg);
    }
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
    return viewToken(token, player, srdFor(editionOf(token, this.store.world)));
  }

  private handle(c: Client, msg: ClientMessage): void {
    if (msg.t === 'ops') return this.onOps(c, msg);
    try {
      if (msg.t === 'undo' || msg.t === 'redo') this.onUndo(c, msg);
      else if (this.history.run(c.player, msg, () => this.dispatch(c, msg))) this.sendHistory();
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      this.fail(c, e.message);
    }
  }

  /** A transaction of document ops (GM only for now): all of it, or a reject saying why not. */
  private onOps(c: Client, msg: Extract<ClientMessage, { t: 'ops' }>): void {
    try {
      requireGm(c.player);
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
        return this.onMove(c, msg.token, msg.to);
      case 'door':
        return this.onDoor(c, msg);
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
        return this.onHotbar(c, msg.token, msg.slots);
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
        return undefined;
    }
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

  private onMove(c: Client, id: string, to: Point): void {
    const token = this.store.tokens.get(id);
    if (!token || !c.visible.has(token.id)) return this.fail(c, 'No such token');
    if (!canControlToken(token, c.player)) return this.fail(c, `You don't control ${token.name}`);
    const g = this.store.world.gridSize;
    const m = PATH_MARGIN * g;
    const walls = this.store.wallsIn({
      x: Math.min(token.x, to[0]) - m,
      y: Math.min(token.y, to[1]) - m,
      w: Math.abs(token.x - to[0]) + 2 * m,
      h: Math.abs(token.y - to[1]) + 2 * m,
    });
    const path = findPath([token.x, token.y], to, walls, { gridSize: g, margin: PATH_MARGIN });
    if (!path) return this.fail(c, `${token.name} can't get there`);
    const [x, y] = path.points.at(-1)!;
    if (path.points.length < 2) return;
    const walker = this.combat.move(token, path.feet);
    this.store.setToken({ ...walker, x, y }, path.points);
    this.zones.moved(token.id, path.points);
    this.reactions.moved(token, path.points);
  }

  private onHotbar(c: Client, id: string, slots: (string | null)[]): void {
    const token = this.store.tokens.get(id);
    if (!token || !c.visible.has(id)) return this.fail(c, 'No such token');
    if (!canControlToken(token, c.player)) return this.fail(c, `You don't control ${token.name}`);
    this.store.setToken({ ...token, hotbar: slots });
  }

  private onDoor(c: Client, msg: Extract<ClientMessage, { t: 'door' }>): void {
    const chunk = this.store.chunks.get(msg.chunk);
    const wall = chunk?.walls.find((w) => w.id === msg.wall);
    if (!chunk || !wall?.door) return this.fail(c, 'No such door');
    if (c.player.role === 'observer') return this.fail(c, 'Observers only watch');
    const touchesLock = wall.door === 'locked' || msg.state === 'locked';
    if (touchesLock && !isGm(c.player)) return this.fail(c, 'The door is locked');
    const walls = chunk.walls.map((w) => (w === wall ? { ...w, door: msg.state } : w));
    this.store.setChunk(msg.chunk, { ...chunk, walls });
  }

  private onChat(c: Client, text: string): void {
    if (!text) return;
    let message: ChatMessage;
    try {
      message = this.chatMessage(c.player, text);
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

  /** Plain text, or a roll for "/r 1d20+5", "/roll ..." and the GM-only "/gmr ...". Throws on a bad formula. */
  private chatMessage(player: Player, text: string): ChatMessage {
    const base = { id: randomUUID(), time: Date.now(), from: player.name, color: player.color };
    const space = text.indexOf(' ');
    const command = space > 0 ? text.slice(0, space).toLowerCase() : '';
    if (!ROLL_COMMANDS.has(command)) return { ...base, text };
    return { ...base, roll: roll(text.slice(space + 1)), gmOnly: command === '/gmr' || undefined };
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

/** world.json minus what changes live: the seats and the time of day. */
function worldSettings(world: World): string {
  const { players: _players, darkness: _darkness, ...settings } = world;
  return JSON.stringify(settings);
}

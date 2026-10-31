import { randomUUID } from 'node:crypto';
import {
  canControlToken,
  DoorStateSchema,
  EditionSchema,
  tokensVisibleTo,
  findPath,
  PointSchema,
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
  type WorldInfo,
} from '@vtt/shared';
import type { RawData, WebSocket } from 'ws';
import { z } from 'zod';
import { CombatActions } from './combat-actions.ts';
import { FeatureActions } from './feature-actions.ts';
import { GmActions } from './gm-actions.ts';
import { SpellActions } from './spell-actions.ts';
import { Refusal, Table } from './table.ts';
import type { WorldStore } from './world-store.ts';

const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('view'), chunks: z.array(z.string()).max(400) }),
  z.object({ t: z.literal('move'), token: z.string(), to: PointSchema }),
  z.object({ t: z.literal('door'), chunk: z.string(), wall: z.string(), state: DoorStateSchema }),
  z.object({ t: z.literal('chat'), text: z.string().min(1).max(2000) }),
  z.object({ t: z.literal('combatStart'), tokens: z.array(z.string()).min(1).max(100) }),
  z.object({ t: z.literal('combatEnd') }),
  z.object({ t: z.literal('endTurn') }),
  z.object({ t: z.literal('attack'), attacker: z.string(), target: z.string(), attack: z.string() }),
  z.object({ t: z.literal('equip'), token: z.string(), item: z.number().int().nonnegative(), equipped: z.boolean() }),
  z.object({
    t: z.literal('cast'),
    caster: z.string(),
    spell: z.string(),
    slot: z.number().int().min(0).max(9),
    free: z.boolean().optional(),
    targets: z.array(z.string()).max(20),
    point: PointSchema.optional(),
    summon: z.string().optional(),
  }),
  z.object({ t: z.literal('feature'), token: z.string(), feature: z.string() }),
  z.object({ t: z.literal('dropConcentration'), token: z.string() }),
  z.object({ t: z.literal('removeEffect'), token: z.string(), effect: z.string() }),
  z.object({ t: z.literal('rest'), tokens: z.array(z.string()).min(1).max(100), kind: z.enum(['short', 'long']) }),
  z.object({ t: z.literal('editToken'), token: z.string(), patch: z.record(z.string(), z.unknown()) }),
  z.object({ t: z.literal('deleteToken'), token: z.string() }),
  z.object({
    t: z.literal('hotbar'),
    token: z.string(),
    slots: z.array(z.string().max(80).nullable()).max(60),
  }),
  z.object({
    t: z.literal('spawn'),
    from: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('monster'), id: z.string(), rules: EditionSchema }),
      z.object({ kind: z.literal('actor'), id: z.string() }),
    ]),
    at: PointSchema,
    hidden: z.boolean().optional(),
  }),
  // The actor itself is checked by GmActions, so a broken one gets a readable refusal.
  z.object({ t: z.literal('saveActor'), actor: z.unknown() }),
  z.object({ t: z.literal('deleteActor'), actor: z.string() }),
]);

interface Client {
  ws: WebSocket;
  player: Player;
  /** Chunks this client is looking at. */
  chunks: Set<string>;
  /** Tokens this client currently knows about. */
  visible: Set<string>;
}

type ClientMessage = z.infer<typeof ClientMessageSchema>;

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
  private spells: SpellActions;
  private features: FeatureActions;
  private gm: GmActions;

  constructor(
    private store: WorldStore,
    { rng = Math.random }: { rng?: Rng } = {},
  ) {
    const table = new Table(store, rng, (text) => this.narrate({ text }));
    this.combat = new CombatActions(table, (attack) => this.narrate({ attack }));
    this.spells = new SpellActions(table, (spell) => this.narrate({ spell }));
    this.features = new FeatureActions(table);
    this.gm = new GmActions(table);
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
    store.on('world', () => {
      // Player list or grid changes need a fresh start on every client.
      for (const c of this.clients) c.ws.close(4000, 'world settings changed');
    });
  }

  findPlayer(id: string): Player | undefined {
    return this.store.world.players.find((p) => p.id === id);
  }

  connect(ws: WebSocket, player: Player): void {
    const client: Client = { ws, player, chunks: new Set(), visible: this.visibleTo(player) };
    this.clients.add(client);
    const { players: _players, ...world } = this.store.world;
    const info: WorldInfo = world;
    this.send(client, {
      t: 'welcome',
      world: info,
      you: player,
      tokens: [...client.visible].map((id) => this.view(this.store.tokens.get(id)!, player)),
      chat: this.chat.filter((m) => !m.gmOnly || player.role === 'gm'),
      combat: this.store.combat ?? null,
      ...(player.role === 'gm' ? { players: this.store.world.players, actors: [...this.store.actors.values()] } : {}),
    });
    ws.on('message', (data) => {
      const msg = parseClientMessage(data);
      if (msg) this.handle(client, msg);
      else this.fail(client, 'Bad message');
    });
    ws.on('close', () => this.clients.delete(client));
    console.log(`[game] ${player.name} joined`);
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
    try {
      this.dispatch(c, msg);
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      this.fail(c, e.message);
    }
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
      case 'hotbar':
        return this.onHotbar(c, msg.token, msg.slots);
      case 'spawn':
        return this.gm.spawn(c.player, msg.from, msg.at, msg.hidden);
      case 'saveActor':
        return this.gm.saveActor(c.player, msg.actor);
      case 'deleteActor':
        return this.gm.deleteActor(c.player, msg.actor);
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
        return this.features.use(c.player, msg.token, msg.feature);
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
    const touchesLock = wall.door === 'locked' || msg.state === 'locked';
    if (touchesLock && c.player.role !== 'gm') return this.fail(c, 'The door is locked');
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
      if (message.gmOnly && other.player.role !== 'gm' && other !== sender) continue;
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
    this.post({ id: randomUUID(), time: Date.now(), from: 'Combat', color: '#c8b48a', ...content });
  }

  private toGms(msg: ServerMessage): void {
    for (const c of this.clients) if (c.player.role === 'gm') this.send(c, msg);
  }

  private fail(c: Client, message: string): void {
    this.send(c, { t: 'error', message });
  }

  private send(c: Client, msg: ServerMessage): void {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }
}

function parseClientMessage(data: RawData): ClientMessage | undefined {
  const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
  const text = buffer.toString('utf8');
  try {
    const parsed = ClientMessageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

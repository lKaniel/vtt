import { randomUUID } from 'node:crypto';
import {
  canControlToken,
  DoorStateSchema,
  tokensVisibleTo,
  findPath,
  PointSchema,
  roll,
  type ChatMessage,
  type Player,
  type Point,
  type ServerMessage,
  type WorldInfo,
} from '@vtt/shared';
import type { RawData, WebSocket } from 'ws';
import { z } from 'zod';
import type { WorldStore } from './world-store.ts';

const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('view'), chunks: z.array(z.string()).max(400) }),
  z.object({ t: z.literal('move'), token: z.string(), to: PointSchema }),
  z.object({ t: z.literal('door'), chunk: z.string(), wall: z.string(), state: DoorStateSchema }),
  z.object({ t: z.literal('chat'), text: z.string().min(1).max(2000) }),
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

  constructor(private store: WorldStore) {
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
    store.on('tokenGone', () => this.refreshAll());
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
      tokens: [...client.visible].map((id) => this.store.tokens.get(id)!),
      chat: this.chat.filter((m) => !m.gmOnly || player.role === 'gm'),
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
      for (const msg of this.visibilityChanges(before, c.visible, changed, path)) this.send(c, msg);
    }
  }

  private visibilityChanges(
    before: Set<string>,
    after: Set<string>,
    changed?: string,
    path?: Point[],
  ): ServerMessage[] {
    const out: ServerMessage[] = [];
    for (const id of before) if (!after.has(id)) out.push({ t: 'tokenGone', id });
    for (const id of after) {
      const token = this.store.tokens.get(id)!;
      if (!before.has(id)) out.push({ t: 'token', token });
      else if (id === changed) out.push(path ? { t: 'moved', id, path } : { t: 'token', token });
    }
    return out;
  }

  private handle(c: Client, msg: ClientMessage): void {
    switch (msg.t) {
      case 'view':
        return this.onView(c, msg.chunks);
      case 'move':
        return this.onMove(c, msg.token, msg.to);
      case 'door':
        return this.onDoor(c, msg);
      case 'chat':
        return this.onChat(c, msg.text.trim());
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
    if (path.points.length > 1) this.store.setToken({ ...token, x, y }, path.points);
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
    this.chat.push(message);
    if (this.chat.length > CHAT_HISTORY) this.chat.shift();
    for (const other of this.clients) {
      if (message.gmOnly && other.player.role !== 'gm' && other !== c) continue;
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

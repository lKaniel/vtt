import { randomUUID } from 'node:crypto';
import {
  canControlToken,
  canSeeToken,
  DoorStateSchema,
  findPath,
  PointSchema,
  roll,
  type ChatMessage,
  type Player,
  type ServerMessage,
  type WorldInfo,
} from '@vtt/shared';
import type { WebSocket } from 'ws';
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
}

const CHAT_HISTORY = 200;
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
    });
    store.on('chunkGone', (key) => {
      for (const c of this.clients) if (c.chunks.has(key)) this.send(c, { t: 'chunk', key, chunk: { tiles: [], walls: [] } });
    });
    store.on('token', (token, path) => {
      for (const c of this.clients) {
        if (!canSeeToken(token, c.player)) this.send(c, { t: 'tokenGone', id: token.id });
        else if (path) this.send(c, { t: 'moved', id: token.id, path });
        else this.send(c, { t: 'token', token });
      }
    });
    store.on('tokenGone', (id) => {
      for (const c of this.clients) this.send(c, { t: 'tokenGone', id });
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
    const client: Client = { ws, player, chunks: new Set() };
    this.clients.add(client);
    const { players: _players, ...world } = this.store.world;
    const info: WorldInfo = world;
    this.send(client, {
      t: 'welcome',
      world: info,
      you: player,
      tokens: [...this.store.tokens.values()].filter((t) => canSeeToken(t, player)),
      chat: this.chat.filter((m) => !m.gmOnly || player.role === 'gm'),
    });
    ws.on('message', (data) => {
      let parsed;
      try {
        parsed = ClientMessageSchema.safeParse(JSON.parse(data.toString()));
      } catch {
        return this.fail(client, 'Bad message');
      }
      if (!parsed.success) return this.fail(client, 'Bad message');
      this.handle(client, parsed.data);
    });
    ws.on('close', () => this.clients.delete(client));
    console.log(`[game] ${player.name} joined`);
  }

  private handle(c: Client, msg: z.infer<typeof ClientMessageSchema>): void {
    switch (msg.t) {
      case 'view': {
        const next = new Set(msg.chunks);
        for (const key of next) {
          if (c.chunks.has(key)) continue;
          const chunk = this.store.chunks.get(key);
          if (chunk) this.send(c, { t: 'chunk', key, chunk });
        }
        c.chunks = next;
        return;
      }
      case 'move': {
        const token = this.store.tokens.get(msg.token);
        if (!token || !canSeeToken(token, c.player)) return this.fail(c, 'No such token');
        if (!canControlToken(token, c.player)) return this.fail(c, `You don't control ${token.name}`);
        const g = this.store.world.gridSize;
        const m = PATH_MARGIN * g;
        const walls = this.store.wallsIn({
          x: Math.min(token.x, msg.to[0]) - m,
          y: Math.min(token.y, msg.to[1]) - m,
          w: Math.abs(token.x - msg.to[0]) + 2 * m,
          h: Math.abs(token.y - msg.to[1]) + 2 * m,
        });
        const path = findPath([token.x, token.y], msg.to, walls, { gridSize: g, margin: PATH_MARGIN });
        if (!path) return this.fail(c, `${token.name} can't get there`);
        if (path.points.length < 2) return;
        const [x, y] = path.points.at(-1)!;
        this.store.setToken({ ...token, x, y }, path.points);
        return;
      }
      case 'door': {
        const chunk = this.store.chunks.get(msg.chunk);
        const wall = chunk?.walls.find((w) => w.id === msg.wall);
        if (!chunk || !wall?.door) return this.fail(c, 'No such door');
        if (c.player.role !== 'gm' && (wall.door === 'locked' || msg.state === 'locked')) {
          return this.fail(c, 'The door is locked');
        }
        const walls = chunk.walls.map((w) => (w === wall ? { ...w, door: msg.state } : w));
        this.store.setChunk(msg.chunk, { ...chunk, walls });
        return;
      }
      case 'chat':
        return this.onChat(c, msg.text.trim());
    }
  }

  private onChat(c: Client, text: string): void {
    const cmd = /^\/(r|roll|gmr)\s+(.+)$/i.exec(text);
    const base = { id: randomUUID(), time: Date.now(), from: c.player.name, color: c.player.color };
    let message: ChatMessage;
    if (cmd) {
      try {
        message = { ...base, roll: roll(cmd[2]!), gmOnly: cmd[1]!.toLowerCase() === 'gmr' || undefined };
      } catch (e) {
        return this.fail(c, (e as Error).message);
      }
    } else if (text) {
      message = { ...base, text };
    } else {
      return;
    }
    this.chat.push(message);
    if (this.chat.length > CHAT_HISTORY) this.chat.shift();
    for (const other of this.clients) {
      if (message.gmOnly && other.player.role !== 'gm' && other !== c) continue;
      this.send(other, { t: 'chat', message });
    }
  }

  private fail(c: Client, message: string): void {
    this.send(c, { t: 'error', message });
  }

  private send(c: Client, msg: ServerMessage): void {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }
}

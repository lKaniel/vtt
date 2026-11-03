// fallow-ignore-file unused-class-member -- Game calls BridgeSocket's members through the WebSocket type
import type { Player } from '@vtt/shared';
import type { ClientMessage, ServerMessage } from '@vtt/system-dnd5e';
import type { WebSocket } from 'ws';
import type { Game } from '../game.ts';

// A seat at the table with no browser behind it, for the Claude bridge
// (mcp-tools.ts): it joins as its player, so the game shows it and lets it
// do exactly what that player may, says what it was told, and leaves.

export type Welcome = Extract<ServerMessage, { t: 'welcome' }>;

/** Stands in for a browser's WebSocket, keeping what the game sends (the tests' FakeSocket too). */
export class BridgeSocket {
  readonly OPEN = 1;
  readyState = 1;
  sent: ServerMessage[] = [];
  private handlers = new Map<string, ((data: Buffer) => void)[]>();

  on(event: string, fn: (data: Buffer) => void): this {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
    return this;
  }

  send(text: string): void {
    this.sent.push(JSON.parse(text) as ServerMessage);
  }

  emit(event: 'message' | 'close', data: Buffer): void {
    for (const fn of this.handlers.get(event) ?? []) fn(data);
  }

  close(): void {
    this.readyState = 3;
    this.emit('close', Buffer.alloc(0));
  }
}

/** Lets the game finish what a message set off (timers set to 0, promises). */
const settle = () => new Promise((done) => setTimeout(done, 0));

async function seated<T>(game: Game, player: Player, fn: (ws: BridgeSocket) => Promise<T>): Promise<T> {
  const ws = new BridgeSocket();
  game.connect(ws as unknown as WebSocket, player);
  try {
    return await fn(ws);
  } finally {
    ws.close();
  }
}

/** What `player` sees of the game right now: the welcome a browser would get. */
export function look(game: Game, player: Player): Promise<Welcome> {
  return seated(game, player, (ws) => {
    const welcome = ws.sent.find((m): m is Welcome => m.t === 'welcome');
    return welcome ? Promise.resolve(welcome) : Promise.reject(new Error('The game sent no welcome'));
  });
}

/** Sends messages as `player`, one after another; the game's replies to them. */
export function act(game: Game, player: Player, msgs: readonly ClientMessage[]): Promise<ServerMessage[]> {
  return seated(game, player, async (ws) => {
    ws.sent = [];
    for (const msg of msgs) {
      ws.emit('message', Buffer.from(JSON.stringify(msg)));
      await settle();
    }
    return ws.sent;
  });
}

/** Sends one message as `player` and waits (up to `wait` ms) for the reply of kind `t`, which may come later (a disk read). */
export function ask<T extends ServerMessage['t']>(
  game: Game,
  player: Player,
  msg: ClientMessage,
  t: T,
): Promise<Extract<ServerMessage, { t: T }>> {
  const wait = 10_000;
  return seated(game, player, async (ws) => {
    ws.sent = [];
    ws.emit('message', Buffer.from(JSON.stringify(msg)));
    for (const started = Date.now(); Date.now() - started < wait; await new Promise((r) => setTimeout(r, 5))) {
      const error = ws.sent.find((m) => m.t === 'error');
      if (error?.t === 'error') throw new Error(error.message);
      const found = ws.sent.find((m): m is Extract<ServerMessage, { t: T }> => m.t === t);
      if (found) return found;
    }
    throw new Error('The game did not answer');
  });
}

/** The game's answer to what was sent: thrown when it refused, else a short note. */
export function outcome(replies: readonly ServerMessage[]): string {
  const error = replies.find((m) => m.t === 'error');
  if (error?.t === 'error') throw new Error(error.message);
  const reject = replies.find((m) => m.t === 'reject');
  if (reject?.t === 'reject') throw new Error(`Refused: ${reject.reason}`);
  const chat = replies.flatMap((m) => (m.t === 'chat' ? [m.message] : []));
  return chat.length ? `Done. Chat: ${JSON.stringify(chat)}` : 'Done.';
}

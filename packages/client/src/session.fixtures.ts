// fallow-ignore-file unused-class-member -- Session calls FakeWebSocket's members through the global WebSocket
// Shared set-up for the Session tests: a fake socket and some tokens.
import type { Combat, ServerMessage, Token } from '@vtt/shared';
import { vi } from 'vitest';
import { Session } from './session.ts';

/** The most recently opened FakeWebSocket. */
let lastSocket: FakeWebSocket | undefined;

/** Stands in for the browser WebSocket. */
export class FakeWebSocket {
  static readonly OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  sent: unknown[] = [];
  onmessage?: (e: { data: string }) => void;
  onclose?: (e: { code: number }) => void;

  constructor(readonly url: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- tests reach the socket the session opened
    lastSocket = this;
  }

  send(text: string): void {
    this.sent.push(JSON.parse(text));
  }

  close(): void {
    this.readyState = 3;
  }

  receive(msg: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

export const token = (id: string, x = 50, y = 50): Token => ({
  id,
  name: id,
  x,
  y,
  size: 1,
  color: '#fff',
  speed: 30,
  darkvision: 0,
  controllers: ['ana'],
  hidden: false,
});

export function welcome(tokens: Token[] = [token('hero')]): ServerMessage {
  return {
    t: 'welcome',
    world: { name: 'Test', gridSize: 100, chunkSize: 1000, start: [0, 0], darkness: 0, vision: true, rules: '2014' },
    you: { id: 'ana', name: 'Ana', role: 'player', color: '#f00' },
    tokens,
    chat: [],
    combat: null,
  };
}

export const fight = (turn: number, move = 30): Combat => ({
  round: 1,
  turn,
  order: [
    { token: 'goblin', initiative: 15 },
    { token: 'hero', initiative: 10 },
  ],
  left: { move, action: true, bonus: true, attacks: 0, used: [] },
  side: {},
});

/** The socket a session opened most recently. */
export function latestSocket(): FakeWebSocket | undefined {
  return lastSocket;
}

/** A session for player `ana`, connected to a fake socket. */
export function openSession(): { session: Session; ws: FakeWebSocket } {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: 'table:3000' });
  const session = new Session('ana');
  session.connect();
  return { session, ws: lastSocket! };
}

export function closeSession(session: Session): void {
  session.close();
  vi.unstubAllGlobals();
}

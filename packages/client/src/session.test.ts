import type { ServerMessage, Token } from '@vtt/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from './session.ts';

/** The most recently opened FakeWebSocket. */
let lastSocket: FakeWebSocket | undefined;

/** Stands in for the browser WebSocket. */
class FakeWebSocket {
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

const token = (id: string, x = 50, y = 50): Token => ({
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

function welcome(tokens: Token[] = [token('hero')]): ServerMessage {
  return {
    t: 'welcome',
    world: { name: 'Test', gridSize: 100, chunkSize: 1000, start: [0, 0], darkness: 0, vision: true },
    you: { id: 'ana', name: 'Ana', role: 'player', color: '#f00' },
    tokens,
    chat: [],
  };
}

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: 'table:3000' });
  session = new Session('ana');
  session.connect();
  ws = lastSocket!;
});

afterEach(() => {
  session.close();
  vi.unstubAllGlobals();
});

describe('Session', () => {
  it('joins with the player id and takes the welcome', () => {
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- the page was loaded over http
    expect(ws.url).toBe('ws://table:3000/ws?player=ana');
    ws.receive(welcome());
    expect(session.status).toBe('open');
    expect(session.canControl(session.tokens.get('hero')!)).toBe(true);
  });

  it('keeps only chunks in view', () => {
    const chunk = { tiles: [], walls: [], lights: [] };
    const gone = vi.fn();
    session.on('chunkGone', gone);
    session.setView(['0_0']);
    ws.receive({ t: 'chunk', key: '0_0', chunk });
    ws.receive({ t: 'chunk', key: '5_5', chunk });
    expect([...session.chunks.keys()]).toEqual(['0_0']);
    session.setView(['1_0']);
    expect(gone).toHaveBeenCalledWith('0_0');
    expect(ws.sent.at(-1)).toEqual({ t: 'view', chunks: ['1_0'] });
  });

  it('moves tokens to the end of their path', () => {
    ws.receive(welcome());
    const moved = vi.fn();
    session.on('moved', moved);
    ws.receive({
      t: 'moved',
      id: 'hero',
      path: [
        [50, 50],
        [150, 50],
      ],
    });
    expect(session.tokens.get('hero')).toMatchObject({ x: 150, y: 50 });
    expect(moved).toHaveBeenCalledOnce();
  });

  it('drops the selection when its token disappears', () => {
    ws.receive(welcome());
    session.select('hero');
    ws.receive({ t: 'tokenGone', id: 'hero' });
    expect(session.selected).toBeUndefined();
    expect(session.tokens.size).toBe(0);
  });

  it('collects chat and errors', () => {
    ws.receive(welcome());
    session.say('hello');
    expect(ws.sent.at(-1)).toEqual({ t: 'chat', text: 'hello' });
    ws.receive({ t: 'chat', message: { id: '1', time: 0, from: 'Ana', color: '#f00', text: 'hello' } });
    ws.receive({ t: 'error', message: 'nope' });
    expect(session.chat).toHaveLength(1);
    expect(session.error?.message).toBe('nope');
  });

  it('asks for its chunks again after reconnecting', () => {
    session.setView(['0_0']);
    ws.receive(welcome());
    expect(ws.sent.at(-1)).toEqual({ t: 'view', chunks: ['0_0'] });
  });

  it('reconnects unless the seat was refused', () => {
    vi.useFakeTimers();
    ws.onclose?.({ code: 1006 });
    expect(session.status).toBe('closed');
    vi.advanceTimersByTime(1000);
    const second = lastSocket!;
    expect(second).not.toBe(ws);
    second.onclose?.({ code: 4001 });
    vi.advanceTimersByTime(1000);
    expect(lastSocket).toBe(second);
    expect(session.error?.message).toMatch(/Unknown player/);
    vi.useRealTimers();
  });

  it('passes focus requests to the map', () => {
    const focus = vi.fn();
    session.on('focus', focus);
    session.focus([10, 20]);
    expect(focus).toHaveBeenCalledWith([10, 20]);
  });
});

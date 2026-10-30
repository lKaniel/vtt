import type { Combat, ServerMessage, Token } from '@vtt/shared';
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
    world: { name: 'Test', gridSize: 100, chunkSize: 1000, start: [0, 0], darkness: 0, vision: true, rules: '2014' },
    you: { id: 'ana', name: 'Ana', role: 'player', color: '#f00' },
    tokens,
    chat: [],
    combat: null,
  };
}

const fight = (turn: number, move = 30): Combat => ({
  round: 1,
  turn,
  order: [
    { token: 'goblin', initiative: 15 },
    { token: 'hero', initiative: 10 },
  ],
  left: { move, action: true, bonus: true, attacks: 0, used: [] },
  side: {},
});

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

  describe('in combat', () => {
    beforeEach(() => {
      ws.receive(welcome([token('hero'), { ...token('goblin', 150), controllers: [] }]));
    });

    it('knows whose turn it is and how far each token may walk', () => {
      ws.receive({ t: 'combat', combat: fight(0) });
      expect(session.combat?.round).toBe(1);
      expect(session.turnToken()?.id).toBe('goblin');
      expect(session.isMyTurn()).toBe(false);
      expect(session.movementLeft('hero')).toBe(0);
      ws.receive({ t: 'combat', combat: fight(1, 20) });
      expect(session.isMyTurn()).toBe(true);
      expect(session.movementLeft('hero')).toBe(20);
      ws.receive({ t: 'combat', combat: null });
      expect(session.movementLeft('hero')).toBe(Infinity);
    });

    it('selects and finds your creature when its turn starts', () => {
      const focus = vi.fn();
      session.on('focus', focus);
      ws.receive({ t: 'combat', combat: fight(1) });
      expect(session.selected).toBe('hero');
      expect(focus).toHaveBeenCalledWith([50, 50]);
    });

    it('arms an attack, then fires it at the clicked target', () => {
      session.select('hero');
      session.arm('Longsword');
      expect(session.armed).toBe('Longsword');
      session.attack('goblin');
      expect(ws.sent.at(-1)).toEqual({ t: 'attack', attacker: 'hero', target: 'goblin', attack: 'Longsword' });
      expect(session.armed).toBeUndefined();
    });

    it('drops the armed attack when the selection changes', () => {
      session.select('hero');
      session.arm('Longsword');
      session.select(undefined);
      expect(session.armed).toBeUndefined();
    });

    it('picks the creatures on screen for a new fight', () => {
      const sheet = { hp: 5, maxHp: 5 } as never;
      ws.receive({ t: 'token', token: { ...token('hero'), sheet } });
      ws.receive({ t: 'token', token: { ...token('goblin', 150), controllers: [], health: 'hurt' } });
      ws.receive({ t: 'token', token: { ...token('far', 5000), health: 'unhurt' } });
      ws.receive({ t: 'token', token: { ...token('lurker', 250), hidden: true, health: 'unhurt' } });
      ws.receive({ t: 'token', token: token('barrel', 350) });
      session.viewRect = { x: 0, y: 0, w: 1000, h: 1000 };
      expect(session.fightersInView()).toEqual(['hero', 'goblin']);
    });

    it('sends turn, combat and equipment requests', () => {
      session.endTurn();
      session.startCombat(['hero', 'goblin']);
      session.endCombat();
      session.equip('hero', 2, true);
      expect(ws.sent.slice(-4)).toEqual([
        { t: 'endTurn' },
        { t: 'combatStart', tokens: ['hero', 'goblin'] },
        { t: 'combatEnd' },
        { t: 'equip', token: 'hero', item: 2, equipped: true },
      ]);
    });
  });
});

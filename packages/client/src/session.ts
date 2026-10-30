import type {
  Chunk,
  ChatMessage,
  ClientMessage,
  DoorState,
  Player,
  Point,
  ServerMessage,
  Token,
  WorldInfo,
} from '@vtt/shared';

type Status = 'connecting' | 'open' | 'closed';

const CHAT_HISTORY = 200;

export interface SessionEvents {
  /** Anything the UI shows changed. */
  change: () => void;
  welcome: () => void;
  chunk: (key: string) => void;
  chunkGone: (key: string) => void;
  token: (token: Token) => void;
  tokenGone: (id: string) => void;
  moved: (id: string, path: Point[]) => void;
  select: (id: string | undefined) => void;
  focus: (point: Point) => void;
}

/**
 * The connection to the game server plus everything this player knows about
 * the world. The map view and the React UI both read from it.
 */
export class Session {
  status: Status = 'connecting';
  world?: WorldInfo;
  you?: Player;
  readonly tokens = new Map<string, Token>();
  readonly chunks = new Map<string, Chunk>();
  chat: ChatMessage[] = [];
  selected?: string;
  error?: { message: string; at: number };
  /** Bumped on every change; React re-renders on it. */
  version = 0;

  private ws?: WebSocket;
  private view: string[] = [];
  private listeners = new Map<keyof SessionEvents, Set<(...args: never[]) => void>>();
  private closed = false;
  private retry?: ReturnType<typeof setTimeout>;

  constructor(readonly playerId: string) {}

  on<K extends keyof SessionEvents>(event: K, fn: SessionEvents[K]): () => void {
    const set = this.listeners.get(event) ?? new Set();
    this.listeners.set(event, set);
    set.add(fn);
    return () => {
      set.delete(fn);
    };
  }

  private emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): void {
    for (const fn of this.listeners.get(event) ?? []) (fn as (...a: Parameters<SessionEvents[K]>) => void)(...args);
  }

  private changed(): void {
    this.version++;
    this.emit('change');
  }

  connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?player=${encodeURIComponent(this.playerId)}`);
    this.ws = ws;
    this.status = 'connecting';
    this.changed();
    ws.onmessage = (e) => this.receive(JSON.parse(e.data as string) as ServerMessage);
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.status = 'closed';
      if (e.code === 4001) this.showError('Unknown player. Pick a seat again.');
      this.changed();
      if (!this.closed && e.code !== 4001) this.retry = setTimeout(() => this.connect(), 1000);
    };
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.retry);
    this.ws?.close();
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Chunks the camera currently needs. Chunks outside it are forgotten. */
  setView(keys: string[]): void {
    this.view = keys;
    const wanted = new Set(keys);
    for (const key of [...this.chunks.keys()]) {
      if (!wanted.has(key)) {
        this.chunks.delete(key);
        this.emit('chunkGone', key);
      }
    }
    this.send({ t: 'view', chunks: keys });
  }

  move(token: string, to: Point): void {
    this.send({ t: 'move', token, to });
  }

  setDoor(chunk: string, wall: string, state: DoorState): void {
    this.send({ t: 'door', chunk, wall, state });
  }

  say(text: string): void {
    this.send({ t: 'chat', text });
  }

  select(id: string | undefined): void {
    if (this.selected === id) return;
    this.selected = id;
    this.emit('select', id);
    this.changed();
  }

  focus(point: Point): void {
    this.emit('focus', point);
  }

  canControl(token: Token): boolean {
    return !!this.you && (this.you.role === 'gm' || token.controllers.includes(this.you.id));
  }

  showError(message: string): void {
    this.error = { message, at: Date.now() };
    this.changed();
  }

  private receive(msg: ServerMessage): void {
    if (this.apply(msg)) this.changed();
  }

  /** Applies one server message; true when the UI should re-render. */
  private apply(msg: ServerMessage): boolean {
    switch (msg.t) {
      case 'welcome':
        this.onWelcome(msg);
        return true;
      case 'chunk':
        if (!this.view.includes(msg.key)) return false;
        this.chunks.set(msg.key, msg.chunk);
        this.emit('chunk', msg.key);
        return false;
      case 'token':
        this.tokens.set(msg.token.id, msg.token);
        this.emit('token', msg.token);
        return true;
      case 'tokenGone':
        return this.onTokenGone(msg.id);
      case 'moved':
        return this.onMoved(msg.id, msg.path);
      case 'chat':
        this.chat = [...this.chat, msg.message].slice(-CHAT_HISTORY);
        return true;
      case 'error':
        this.showError(msg.message);
        return false;
    }
  }

  private onWelcome(msg: Extract<ServerMessage, { t: 'welcome' }>): void {
    this.status = 'open';
    this.world = msg.world;
    this.you = msg.you;
    for (const id of this.tokens.keys()) this.emit('tokenGone', id);
    this.tokens.clear();
    for (const t of msg.tokens) this.tokens.set(t.id, t);
    this.chat = msg.chat;
    // A reconnect starts from scratch: ask for the chunks again.
    this.chunks.clear();
    this.emit('welcome');
    for (const t of msg.tokens) this.emit('token', t);
    if (this.view.length) this.send({ t: 'view', chunks: this.view });
  }

  private onTokenGone(id: string): boolean {
    if (!this.tokens.delete(id)) return false;
    if (this.selected === id) this.select(undefined);
    this.emit('tokenGone', id);
    return true;
  }

  private onMoved(id: string, path: Point[]): boolean {
    const t = this.tokens.get(id);
    const end = path.at(-1);
    if (!t || !end) return false;
    this.tokens.set(id, { ...t, x: end[0], y: end[1] });
    this.emit('moved', id, path);
    return true;
  }
}

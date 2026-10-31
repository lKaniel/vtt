import {
  canControlToken,
  canEditToken,
  currentTurn,
  featureSpell,
  isGm,
  type Actor,
  type Chunk,
  type ChatMessage,
  type ClientMessage,
  type Combat,
  type DoorState,
  type Player,
  type Point,
  type Rect,
  type Role,
  type ServerMessage,
  type SpawnSource,
  type Token,
  type TokenView,
  type WorldInfo,
} from '@vtt/shared';

import { dropMessage, type DragPayload } from './drops.ts';
import { aimFor, aimSpell, castMessage, pick, type Aiming } from './targeting.ts';

type Status = 'connecting' | 'open' | 'closed';

/** What a character sheet shows: a token on the map or (GM only) an actor in the list. */
export interface SheetTarget {
  kind: 'token' | 'actor';
  id: string;
}

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
  /** The fight started, ended or moved on. */
  combat: () => void;
  /** An attack or spell was readied or put away. */
  armed: () => void;
  focus: (point: Point) => void;
  /** A chat message arrived live (not the history sent on joining). */
  chat: (message: ChatMessage) => void;
}

/**
 * The connection to the game server plus everything this player knows about
 * the world. The map view and the React UI both read from it.
 */
export class Session {
  status: Status = 'connecting';
  world?: WorldInfo;
  you?: Player;
  readonly tokens = new Map<string, TokenView>();
  readonly chunks = new Map<string, Chunk>();
  chat: ChatMessage[] = [];
  selected?: string;
  /** The fight in progress, if any. */
  combat: Combat | null = null;
  /** The attack the selected token will make on the next token clicked. */
  armed?: string;
  /** Slot level to Divine Smite with on the armed attack. */
  smite?: number;
  /** The spell the selected token is aiming, and what it has picked so far. */
  aiming?: Aiming;
  error?: { message: string; at: number };
  /** GM only: everyone at the table. */
  players: Player[] = [];
  /** GM only: the Actors list. */
  readonly actors = new Map<string, Actor>();
  /** The open character sheet; `edit` is edit mode (the GM's, or a trusted owner's). */
  sheet?: SheetTarget & { edit: boolean };
  /** GM only: creatures dropped on the map arrive hidden from the players. */
  spawnHidden = false;
  /** The part of the world on screen, kept up to date by the map. */
  viewRect?: Rect;
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
    if (this.armed ?? this.aiming) this.arm(undefined);
    this.emit('select', id);
    this.changed();
  }

  /** Readies an attack of the selected token; the next token clicked is the target. */
  arm(attack: string | undefined): void {
    this.armed = attack;
    this.smite = undefined;
    this.aiming = undefined;
    this.emit('armed');
    this.changed();
  }

  /** Readies a spell of the selected token with a slot, or for free; self spells go off at once. */
  aim(spellId: string | undefined, slot = 0, free = false): void {
    const sheet = this.selected ? this.tokens.get(this.selected)?.sheet : undefined;
    this.armed = undefined;
    this.aiming = aimFor(sheet, spellId, { slot, free });
    if (this.aiming?.mode === 'self') return this.confirmCast();
    this.emit('armed');
    this.changed();
  }

  /** Readies a feature of the selected token that's aimed like a spell; one without targets goes off at once. */
  aimFeature(featureId: string | undefined): void {
    const token = this.selected ? this.tokens.get(this.selected) : undefined;
    const feature = token?.sheet?.features.find((f) => f.id === featureId);
    this.armed = undefined;
    this.aiming = feature && { ...aimSpell(featureSpell(feature), 0, token?.stats?.level ?? 1), feature: feature.id };
    if (this.aiming?.mode === 'self') return this.confirmCast();
    this.emit('armed');
    this.changed();
  }

  /** Casts the aimed spell without spending a slot, or with one again. */
  setFreeCast(free: boolean): void {
    if (this.aiming) this.aiming = { ...this.aiming, free };
    this.changed();
  }

  /** Puts away an aimed spell or readied attack; false if there was none. */
  cancelAction(): boolean {
    if (!this.armed && !this.aiming) return false;
    this.arm(undefined);
    return true;
  }

  /** Changes what the aimed summoning spell brings. */
  chooseSummon(monster: string): void {
    if (this.aiming) this.aiming = { ...this.aiming, summon: monster };
    this.changed();
  }

  pickTarget(id: string): void {
    if (!this.aiming) return;
    const { aiming, done } = pick(this.aiming, id);
    this.aiming = aiming;
    if (done) this.confirmCast();
    else this.changed();
  }

  /** Casts the aimed spell at a point (areas, teleports, summons). */
  castAt(point: Point): void {
    this.confirmCast(point);
  }

  /** Casts the aimed spell now, with the targets picked so far. */
  confirmCast(point?: Point): void {
    if (this.selected && this.aiming) this.send(castMessage(this.selected, this.aiming, point));
    this.aim(undefined);
  }

  useFeature(token: string, feature: string): void {
    this.send({ t: 'feature', token, feature });
  }

  /** Uses one of an item the token carries (drinks a potion). */
  useItem(token: string, item: string): void {
    this.send({ t: 'useItem', token, item });
  }

  rest(tokens: string[], kind: 'short' | 'long'): void {
    this.send({ t: 'rest', tokens, kind });
  }

  dropConcentration(token: string): void {
    this.send({ t: 'dropConcentration', token });
  }

  removeEffect(token: string, effect: string): void {
    this.send({ t: 'removeEffect', token, effect });
  }

  /** Spends a slot of this level on Divine Smite if the armed attack hits; undefined for no smite. */
  setSmite(slot: number | undefined): void {
    this.smite = slot;
    this.changed();
  }

  attack(target: string): void {
    if (!this.selected || !this.armed) return;
    const smite = this.smite ? { smite: this.smite } : {};
    this.send({ t: 'attack', attacker: this.selected, target, attack: this.armed, ...smite });
    this.arm(undefined);
  }

  endTurn(): void {
    this.send({ t: 'endTurn' });
  }

  startCombat(tokens: string[]): void {
    this.send({ t: 'combatStart', tokens });
  }

  endCombat(): void {
    this.send({ t: 'combatEnd' });
  }

  equip(token: string, item: number, equipped: boolean): void {
    this.send({ t: 'equip', token, item, equipped });
  }

  // GM tools ---------------------------------------------------------------

  /** Opens a sheet (or closes it with undefined); only those who may edit it can open it for editing. */
  openSheet(target: SheetTarget | undefined, edit = false): void {
    const editable = target && (target.kind === 'actor' ? this.isGm() : this.canEdit(target.id));
    this.sheet = target && { ...target, edit: edit && !!editable };
    this.changed();
  }

  isGm(): boolean {
    return !!this.you && isGm(this.you);
  }

  /** The GM edits any token; a trusted player the ones they own. */
  canEdit(id: string): boolean {
    const token = this.tokens.get(id);
    return !!this.you && !!token && canEditToken(token, this.you);
  }

  /** GM: change what a seat may do at the table. */
  setRole(player: string, role: Role): void {
    this.send({ t: 'setRole', player, role });
  }

  setSheetEdit(edit: boolean): void {
    if (this.sheet) this.openSheet(this.sheet, edit);
  }

  /** Saves how the creature's action bar is arranged. */
  setHotbar(token: string, slots: (string | null)[]): void {
    this.send({ t: 'hotbar', token, slots });
  }

  setSpawnHidden(hidden: boolean): void {
    this.spawnHidden = hidden;
    this.changed();
  }

  editToken(token: string, patch: Record<string, unknown>): void {
    if (Object.keys(patch).length) this.send({ t: 'editToken', token, patch });
  }

  deleteToken(token: string): void {
    this.send({ t: 'deleteToken', token });
  }

  spawn(from: SpawnSource, at: Point): void {
    this.send({ t: 'spawn', from, at, hidden: this.spawnHidden });
  }

  saveActor(actor: Actor): void {
    this.send({ t: 'saveActor', actor });
  }

  deleteActor(id: string): void {
    this.send({ t: 'deleteActor', actor: id });
  }

  /** Something dragged from the Actors list or Compendium was dropped on the map at `p`. */
  drop(payload: DragPayload, p: Point): void {
    if (!this.world) return;
    const ctx = { tokens: this.tokens.values(), gridSize: this.world.gridSize, rules: this.world.rules };
    const msg = dropMessage(payload, p, { ...ctx, hidden: this.spawnHidden });
    if ('error' in msg) this.showError(msg.error);
    else this.send(msg);
  }

  /** The centre of the screen, where Compendium buttons place things. */
  viewCentre(): Point {
    const r = this.viewRect;
    return r ? [r.x + r.w / 2, r.y + r.h / 2] : (this.world?.start ?? [0, 0]);
  }

  /** Visible creatures (tokens with stats) on screen: who joins a fight the GM starts. */
  fightersInView(): string[] {
    const r = this.viewRect;
    if (!r) return [];
    const inView = (t: TokenView) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h;
    return [...this.tokens.values()].filter((t) => (t.sheet ?? t.health) && !t.hidden && inView(t)).map((t) => t.id);
  }

  /** The token whose turn it is in the fight. */
  turnToken(): TokenView | undefined {
    const id = this.combat ? currentTurn(this.combat) : undefined;
    return id ? this.tokens.get(id) : undefined;
  }

  isMyTurn(): boolean {
    const token = this.turnToken();
    return !!token && this.canControl(token);
  }

  /** Feet the token may still walk: unlimited outside a fight, nothing when it's not its turn. */
  movementLeft(id: string): number {
    const combat = this.combat;
    if (!combat?.order.some((e) => e.token === id)) return Infinity;
    return currentTurn(combat) === id ? combat.left.move : 0;
  }

  focus(point: Point): void {
    this.emit('focus', point);
  }

  canControl(token: Token): boolean {
    return !!this.you && canControlToken(token, this.you);
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
        this.emit('chat', msg.message);
        return true;
      case 'combat':
        this.onCombat(msg.combat);
        return true;
      case 'actor':
      case 'actorGone':
        this.onActor(msg);
        return true;
      case 'error':
        this.showError(msg.message);
        return false;
    }
  }

  /** When one of your creatures' turns starts, select it and bring it into view. */
  private onCombat(combat: Combat | null): void {
    const before = this.combat ? `${this.combat.round}:${currentTurn(this.combat)}` : '';
    this.combat = combat;
    this.emit('combat');
    const token = this.turnToken();
    if (!combat || !token || !this.canControl(token)) return;
    if (before === `${combat.round}:${token.id}`) return;
    this.select(token.id);
    this.focus([token.x, token.y]);
  }

  private onWelcome(msg: Extract<ServerMessage, { t: 'welcome' }>): void {
    this.status = 'open';
    this.world = msg.world;
    this.you = msg.you;
    for (const id of this.tokens.keys()) this.emit('tokenGone', id);
    this.tokens.clear();
    for (const t of msg.tokens) this.tokens.set(t.id, t);
    this.chat = msg.chat;
    this.combat = msg.combat;
    this.players = msg.players ?? [];
    this.actors.clear();
    for (const a of msg.actors ?? []) this.actors.set(a.id, a);
    // A new role may take edit mode away (or the creature out of sight).
    if (this.sheet) this.reopenSheet(this.sheet);
    // A reconnect starts from scratch: ask for the chunks again.
    this.chunks.clear();
    this.emit('welcome');
    for (const t of msg.tokens) this.emit('token', t);
    if (this.view.length) this.send({ t: 'view', chunks: this.view });
  }

  private reopenSheet(sheet: SheetTarget & { edit: boolean }): void {
    const there = sheet.kind === 'token' ? this.tokens.has(sheet.id) : this.actors.has(sheet.id);
    this.openSheet(there ? sheet : undefined, sheet.edit);
  }

  private onActor(msg: Extract<ServerMessage, { t: 'actor' | 'actorGone' }>): void {
    if (msg.t === 'actor') {
      this.actors.set(msg.actor.id, msg.actor);
      return;
    }
    this.actors.delete(msg.id);
    if (this.sheet?.kind === 'actor' && this.sheet.id === msg.id) this.sheet = undefined;
  }

  private onTokenGone(id: string): boolean {
    if (!this.tokens.delete(id)) return false;
    if (this.selected === id) this.select(undefined);
    if (this.sheet?.kind === 'token' && this.sheet.id === id) this.sheet = undefined;
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

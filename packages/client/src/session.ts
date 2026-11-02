import type { DocRef, PluginLoad } from '@vtt/core';
import {
  canControl,
  canEdit,
  type Chunk,
  isGm,
  type MoveGrid,
  type Player,
  type Point,
  sceneLattice,
  type WorldInfo,
} from '@vtt/shared';
import {
  type Actor,
  type ChatMessage,
  type ClientMessage,
  type Combat,
  currentTurn,
  type ReactionOffer,
  type ServerMessage,
  type SpawnSource,
  type Token,
  type TokenView,
} from '@vtt/system-dnd5e';
import { openSocket, refusalOf } from './session-socket.ts';
import { isMyTurn, movementLeft, turnToken } from './turns.ts';

import type { DragPayload } from './drops.ts';
import { dropOnMap } from './session-drops.ts';
import { refOf } from './editor/selection.ts';
import { withOffer } from './reactions.ts';
import { Presence } from './presence.ts';
import { Rulers } from './rulers.ts';
import type { SessionEvents } from './session-events.ts';
import { Actions, type ActionEvents } from './session-actions.ts';
import { Fog, type FogEvents } from './session-fog.ts';
import { ItemSession } from './session-items.ts';
import { isTableNews, type TableNews, withChat } from './session-news.ts';
import type { SessionPart } from './session-part.ts';
import { type SceneEvents, Scenes } from './session-scenes.ts';
import { Targets } from './targets.ts';
import { Hud, type HudEvents } from './session-hud.ts';
import { Journal, type JournalEvents } from './session-journal.ts';
import { type PackEvents, Packs } from './session-packs.ts';
import { Piles } from './session-piles.ts';
import { Cards } from './session-cards.ts';
import { ScriptHost } from './scripting/script-api.ts';

type Status = 'connecting' | 'open' | 'closed';
type PartEvents = ActionEvents & HudEvents & JournalEvents & PackEvents & FogEvents & SceneEvents;

/** What a character sheet shows: a token on the map or (GM only) an actor in the list. */
export interface SheetTarget {
  kind: 'token' | 'actor';
  id: string;
}

/**
 * The connection to the game server plus everything this player knows about
 * the world. The map view and the React UI both read from it.
 */
export class Session extends ItemSession {
  status: Status = 'connecting';
  world?: WorldInfo;
  you?: Player;
  readonly tokens = new Map<string, TokenView>();
  readonly chunks = new Map<string, Chunk>();
  chat: ChatMessage[] = [];
  selected?: string;
  /** The fight in progress, if any. */
  combat: Combat | null = null;
  /** Chances one of your creatures has to react (an opportunity attack). */
  reactions: ReactionOffer[] = [];
  /** The toast: an error, or with `info` news such as "Undid the move". */
  error?: { message: string; at: number; info?: boolean };
  /** GM only: everyone at the table. */
  players: Player[] = [];
  /** GM only: the Actors list. */
  readonly actors = new Map<string, Actor>();
  /** The open character sheet; `edit` is edit mode (the GM's, or a trusted owner's). */
  sheet?: SheetTarget & { edit: boolean };
  /** GM only: creatures dropped on the map arrive hidden from the players. */
  spawnHidden = false;
  /** The decks, hands and piles you were sent (session-cards.ts). */
  readonly cards = new Cards(this);
  /** The creatures you target (T), and the others'. */
  readonly targets = new Targets({
    send: (msg) => this.send(msg),
    changed: () => this.notify('targets'),
    you: () => this.you,
  });
  /** What the parts may ask of the session beyond its public face. */
  private readonly ev: PartEvents = {
    changed: () => this.changed(),
    armed: () => this.notify('armed'),
    lit: () => this.notify('lighting'),
    editorChanged: () => this.editorChanged(),
    fogChanged: () => this.emit('fog'),
    gridSize: () => this.gridSize(),
    updates: (label, updates) => this.sendUpdates(label, updates),
    runScript: (doc, token) => this.scripts.run(doc, token),
    heard: (src, volume) => this.emit('sound', src, volume),
    createImageTile: (r, src) => this.createImageTile(r, src),
    reseat: (you) => (this.you = you),
  };
  /** The selected creature's readied attack or aimed spell, and your roll mode. */
  readonly actions = new Actions(this, this.ev);
  readonly piles = new Piles(this, this.ev);
  readonly hud = new Hud(this, this.ev);
  readonly journal = new Journal(this, this.ev);
  readonly packs = new Packs(this, this.ev);
  readonly scenes = new Scenes(this, this.ev);
  readonly fog = new Fog(this, this.ev);
  /** The parts that take messages, the welcome and departures. */
  private readonly parts: SessionPart[] = [this.journal, this.packs, this.scenes, this.fog, this.hud, this.piles];
  /** The GM paused the game: players can't act until it resumes. */
  paused = false;
  /** Your ruler and the ones the others on your scene are laying. */
  readonly rulers = new Rulers(
    (msg) => this.send(msg),
    () => this.emit('rulers'),
  );
  /** The others' cursors and everyone's pings; yours go to the table from here. */
  readonly presence = new Presence({
    send: (msg) => this.send(msg),
    changed: () => this.emit('presence'),
    focus: (at) => this.focus(at),
    you: () => this.you,
  });
  /** Bumped on every change; React re-renders on it. */
  version = 0;

  private ws?: WebSocket;
  private view: string[] = [];
  private listeners = new Map<keyof SessionEvents, Set<(...args: never[]) => void>>();
  private closed = false;
  private retry?: ReturnType<typeof setTimeout>;
  /** The plugins the game turned on, to load (docs/plugins.md). */
  pluginLoads: readonly PluginLoad[] = [];
  /** Hooks, the scripting API (`vtt`), script macros and plugins: docs/scripting.md. */
  readonly scripts: ScriptHost = new ScriptHost(this);

  /** `gameId` is the game to join (else the home game), as the player this browser joined it as. */
  constructor(readonly gameId?: string) {
    super();
  }

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

  protected notify(event: 'armed' | 'targets' | 'lighting'): void {
    this.emit(event);
  }

  protected changed(): void {
    this.version++;
    this.emit('change');
  }

  connect(): void {
    const ws = openSocket(location, this.gameId);
    this.ws = ws;
    this.status = 'connecting';
    this.changed();
    ws.onmessage = (e) => this.receive(JSON.parse(e.data as string) as ServerMessage);
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.status = 'closed';
      const refused = refusalOf(e.code);
      if (refused) this.showError(refused);
      this.changed();
      if (!this.closed && !refused) this.retry = setTimeout(() => this.connect(), 1000);
    };
  }

  close(): void {
    this.closed = true;
    this.scripts.hooks.clear();
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
    for (const key of [...this.chunks.keys()])
      if (!wanted.has(key) && this.chunks.delete(key)) this.emit('chunkGone', key);
    this.send({ t: 'view', chunks: keys });
  }

  /** Selects one token alone (or none), the one the action bar and the keys act with. */
  select(id: string | undefined): void {
    if (this.mode === 'tokens') this.selection = id ? [this.tokenKey(id)] : [];
    this.setPrimary(id);
    this.emit('selection');
  }

  /** Makes a token the one you act with, keeping the rest of the selection. */
  setPrimary(id: string | undefined): void {
    if (this.selected === id) return this.changed();
    this.selected = id;
    if (this.actions.armed ?? this.actions.aiming) this.actions.arm(undefined);
    this.emit('select', id);
    this.changed();
  }

  /** In the tokens mode the selected token stays the one you act with while it is still selected. */
  protected selectionChanged(): void {
    if (this.mode === 'tokens') {
      const ids = this.selection.map((key) => refOf(key).id);
      this.setPrimary(this.selected && ids.includes(this.selected) ? this.selected : ids[0]);
    } else this.changed();
    this.emit('selection');
  }

  protected editorChanged(): void {
    this.emit('editor');
    this.changed();
  }

  protected knownTokens(): Iterable<TokenView> {
    return this.tokens.values();
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
    return !!this.you && !!token && canEdit(token, this.you);
  }

  setSheetEdit(edit: boolean): void {
    if (this.sheet) this.openSheet(this.sheet, edit);
  }

  setSpawnHidden(hidden: boolean): void {
    this.spawnHidden = hidden;
    this.changed();
  }

  spawn(from: SpawnSource, at: Point): void {
    this.send({ t: 'spawn', from, at, hidden: this.spawnHidden });
  }

  /** Something dragged from the side panel or a sheet's inventory was dropped on the map at `p`. */
  drop(payload: DragPayload, p: Point): void {
    dropOnMap(this, payload, p);
  }

  protected startPoint(): Point {
    return this.world?.start ?? [0, 0];
  }

  /** The token whose turn it is in the fight. */
  turnToken(): TokenView | undefined {
    return turnToken(this.combat, this.tokens);
  }

  /** One of your creatures may act now (its turn, or it shares the party's). */
  isMyTurn(): boolean {
    return isMyTurn(this.combat, this.tokens, (t) => this.canControl(t));
  }

  /** Feet the token may still walk: unlimited outside a fight, nothing when it's not its turn. */
  movementLeft(id: string): number {
    return movementLeft(this.combat, this.tokens, id);
  }

  focus(point: Point): void {
    this.emit('focus', point);
  }

  canControl(token: Token): boolean {
    return !!this.you && canControl(token, this.you);
  }

  /** GM: pauses the game, or lets it go on. */
  setPaused(on: boolean): void {
    this.send({ t: 'pause', on });
  }

  protected editTargets(): DocRef[] {
    if (this.selection.length) return this.selection.map(refOf);
    if (this.selected) return [{ coll: `${this.scene}/tokens`, id: this.selected }];
    if (this.sheet?.kind === 'actor') return [{ coll: 'actors', id: this.sheet.id }];
    return [];
  }

  protected gridSize(): number {
    return this.world?.gridSize ?? 100;
  }

  moveGrid(): MoveGrid {
    return (this.world && sceneLattice(this.world)) ?? this.gridSize();
  }

  showError(message: string): void {
    this.error = { message, at: Date.now() };
    this.changed();
  }

  showNotice(message: string): void {
    this.error = { message, at: Date.now(), info: true };
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
        this.chat = withChat(this.chat, msg.message);
        this.emit('chat', msg.message);
        return true;
      case 'combat':
        this.onCombat(msg.combat);
        return true;
      case 'actor':
      case 'actorGone':
        this.onActor(msg);
        return true;
      default:
        return this.applyOther(msg);
    }
  }

  private applyOther(msg: ServerMessage): boolean {
    if (isTableNews(msg)) return this.onPresence(msg);
    switch (msg.t) {
      case 'lighting':
        if (this.world) this.world = { ...this.world, darkness: msg.darkness };
        this.emit('lighting');
        return true;
      case 'weather':
        if (this.world) this.world = { ...this.world, weather: msg.weather };
        return true;
      case 'error':
        this.showError(msg.message);
        return false;
      case 'reactionOffer':
      case 'reactionGone':
        this.reactions = withOffer(this.reactions, msg);
        return true;
      case 'paused':
        this.paused = msg.on;
        return true;
      case 'chatUndone':
        this.chat = this.chat.map((m) => (msg.ids.includes(m.id) ? { ...m, undone: msg.undone || undefined } : m));
        return true;
      default:
        return this.applyParts(msg);
    }
  }

  /** A message for one of the session's parts, else an edit. */
  private applyParts(msg: ServerMessage): boolean {
    for (const part of this.parts) {
      const changed = part.receive?.(msg);
      if (changed !== undefined) return changed;
    }
    return this.applyEdit(msg);
  }

  /** Someone else's ruler, cursor, ping or targets: drawn over the map, nothing the UI re-renders for. */
  private onPresence(msg: TableNews): false {
    if (msg.t === 'ruler') this.rulers.receive(msg);
    else if (msg.t === 'targets') this.targets.receive(msg);
    else this.presence.receive(msg);
    return false;
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
    this.paused = !!msg.paused;
    this.rulers.reset();
    this.presence.reset();
    this.targets.reset((id) => this.tokens.has(id));
    this.welcomeEdits(msg);
    for (const part of this.parts) part.welcome?.(msg);
    this.players = msg.players ?? [];
    this.pluginLoads = msg.plugins ?? [];
    this.actors.clear();
    for (const a of msg.actors ?? []) this.actors.set(a.id, a);
    // A new role may take edit mode away (or the creature out of sight).
    if (this.sheet) this.reopenSheet(this.sheet);
    // A reconnect starts from scratch: ask for the chunks again.
    this.chunks.clear();
    this.emit('welcome');
    for (const t of msg.tokens) this.emit('token', t);
    if (this.view.length) this.send({ t: 'view', chunks: this.view });
    this.send({ t: 'rollMode', mode: this.actions.rollMode });
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
    this.targets.forget(id);
    for (const part of this.parts) part.gone?.(id);
    if (this.mode === 'tokens') this.pruneSelection((key) => key !== this.tokenKey(id));
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

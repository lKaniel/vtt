import { type DocRef, DocStore, type PluginLoad } from '@vtt/core';
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
  WIDE_CHUNK,
} from '@vtt/shared';
import {
  type Actor,
  type ChatMessage,
  type ClientMessage,
  type Combat,
  currentTurn,
  type ReactionOffer,
  type ServerMessage,
  type Token,
  type TokenView,
} from '@vtt/system-dnd5e';
import { openSocket, refusalOf } from './session-socket.ts';
import { Turns } from './turns.ts';

import { type DropEvents, Drops } from './session-drops.ts';
import { Sheets } from './session-sheets.ts';
import { refOf } from '../editor/selection.ts';
import { withOffer } from './reactions.ts';
import { Presence } from './presence.ts';
import { Rulers } from './rulers.ts';
import type { SessionEvents } from './session-events.ts';
import { Actions, type ActionEvents } from './session-actions.ts';
import { Fog, type FogEvents } from './session-fog.ts';
import { Draw } from './session-items.ts';
import { Levels } from './session-levels.ts';
import { View3DSwitch } from './session-view3d.ts';
import { ThroughWalls } from './session-through-walls.ts';
import { Editor, type EditorEvents } from './session-editor.ts';
import { mayEditRefs } from './authorship.ts';
import { Requests } from './session-requests.ts';
import { type EditEvents, Edits } from './session-edits.ts';
import { WorldTime } from './session-time.ts';
import { Tiles } from './session-tiles.ts';
import { isTableNews, type TableNews, withChat } from './session-news.ts';
import type { SessionPart } from './session-part.ts';
import { type SceneEvents, Scenes } from './session-scenes.ts';
import { Targets } from './targets.ts';
import { Hud, type HudEvents } from './session-hud.ts';
import { Journal, type JournalEvents } from './session-journal.ts';
import { Book } from './session-book.ts';
import { type PackEvents, Packs } from './session-packs.ts';
import { Piles } from './session-piles.ts';
import { Inspecting } from './session-inspect.ts';
import { Cards } from './session-cards.ts';
import { Folders } from './session-folders.ts';
import { ScriptHost } from '../scripting/script-api.ts';

type Status = 'connecting' | 'open' | 'closed';
type PartEvents = EditEvents &
  DropEvents &
  EditorEvents &
  ActionEvents &
  HudEvents &
  JournalEvents &
  PackEvents &
  FogEvents &
  SceneEvents;

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
  /** The game's documents as this client knows them (GM only for now), kept up to date by `docs` messages. */
  docs = new DocStore();
  /** The scene everyone is on. */
  scene = '';
  /** Where the pointer is on the map: pastes land there. */
  pointer?: Point;
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
  /** The plain requests to the server: move, end turn, rest, save an actor... */
  readonly requests = new Requests(this);
  /** The decks, hands and piles you were sent (session-cards.ts). */
  readonly cards = new Cards(this);
  /** The sidebar lists' folders (session-folders.ts). */
  readonly folders = new Folders(this);
  /** The creatures you target (T), and the others'. */
  readonly targets = new Targets(this.wire(() => this.emit('targets')));
  /** What the parts may ask of the session beyond its public face. */
  private readonly ev: PartEvents = {
    changed: () => this.changed(),
    armed: () => this.emit('armed'),
    lit: () => this.emit('lighting'),
    editorChanged: () => this.editorChanged(),
    fogChanged: () => this.emit('fog'),
    gridSize: () => this.gridSize(),
    updates: (label, updates) => this.edits.sendUpdates(label, updates),
    runScript: (doc, token) => this.scripts.run(doc, token),
    heard: (src, volume) => this.emit('sound', src, volume),
    reseat: (you) => (this.you = you),
    createImageTile: (r, src) => this.tiles.createImage(r, src),
    selectionChanged: () => this.selectionChanged(),
    startPoint: () => this.world?.start ?? [0, 0],
    mayEdit: (refs) => mayEditRefs(this.you, this.docs, refs),
    docsChanged: () => this.editor.docsChanged(),
    editTargets: () => this.editTargets(),
    notice: (message) => this.showNotice(message),
    placeMedia: (src, at, size) => this.packs.placeMedia(src, at, size),
  };
  /** Copy, paste, delete, undo and redo, and the edits shown before the server confirms them. */
  readonly edits: Edits = new Edits(this, this.ev);
  /** The game clock and calendar. */
  readonly time = new WorldTime(this);
  /** The selected creature's readied attack or aimed spell, and your roll mode. */
  readonly actions = new Actions(this, this.ev);
  readonly piles = new Piles(this, this.ev);
  readonly inspect = new Inspecting(this.ev);
  readonly hud = new Hud(this, this.ev);
  readonly journal = new Journal(this, this.ev);
  /** The adventure book (J): quests, maps, lore, the party log, the timeline. */
  readonly book = new Book(this, this.ev);
  readonly packs = new Packs(this, this.ev);
  readonly scenes = new Scenes(this, this.ev);
  readonly fog = new Fog(this, this.ev);
  readonly draw = new Draw(this, this.ev);
  readonly levels = new Levels(this, this.ev);
  /** Whether this browser shows the map in 3D. */
  readonly view3d = new View3DSwitch(this.ev, this);
  /** GM: moves go straight through walls (session-through-walls.ts). */
  readonly throughWalls = new ThroughWalls(this.ev, this);
  readonly turns = new Turns(this);
  /** The open character sheet. */
  readonly sheets = new Sheets(this, this.ev);
  /** Spawning creatures and what is dropped on the map or the open sheet. */
  readonly drops = new Drops(this, this.ev);
  readonly tiles: Tiles = new Tiles(this, this.ev);
  readonly editor: Editor = new Editor(this, this.ev);
  /** The parts that take messages, the welcome and departures. */
  private readonly parts: SessionPart[] = [
    this.edits,
    this.time,
    this.journal,
    this.packs,
    this.scenes,
    this.fog,
    this.hud,
    this.piles,
    this.sheets,
    this.levels,
  ];
  /** The GM paused the game: players can't act until it resumes. */
  paused = false;
  /** Your ruler and the ones the others on your scene are laying. */
  readonly rulers = new Rulers(
    (msg) => this.send(msg),
    () => this.emit('rulers'),
  );
  /** The others' cursors and everyone's pings; yours go to the table from here. */
  readonly presence = new Presence(this.wire(() => this.emit('presence')));
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
  constructor(readonly gameId?: string) {}

  on<K extends keyof SessionEvents>(event: K, fn: SessionEvents[K]): () => void {
    const set = this.listeners.get(event) ?? new Set();
    this.listeners.set(event, set);
    set.add(fn);
    return () => set.delete(fn);
  }

  private emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): void {
    for (const fn of this.listeners.get(event) ?? []) (fn as (...a: Parameters<SessionEvents[K]>) => void)(...args);
  }

  /** The table as the targets and presence see it: a way to the server, your seat, and the camera. */
  private wire(changed: () => void) {
    return {
      send: (m: ClientMessage) => this.send(m),
      changed,
      you: () => this.you,
      focus: (at: Point) => this.focus(at),
    };
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
  setView(chunks: string[]): void {
    // The scene-wide chunk (tiles bigger than a chunk) is always in view.
    const keys = chunks.includes(WIDE_CHUNK) ? chunks : [...chunks, WIDE_CHUNK];
    this.view = keys;
    const wanted = new Set(keys);
    for (const key of [...this.chunks.keys()])
      if (!wanted.has(key) && this.chunks.delete(key)) this.emit('chunkGone', key);
    this.send({ t: 'view', chunks: keys });
  }

  /** Selects one token alone (or none), the one the action bar and the keys act with. */
  select(id: string | undefined): void {
    if (this.editor.mode === 'tokens') this.editor.selection = id ? [this.editor.tokenKey(id)] : [];
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
    if (this.editor.mode === 'tokens') {
      const ids = this.editor.selection.map((key) => refOf(key).id);
      this.setPrimary(this.selected && ids.includes(this.selected) ? this.selected : ids[0]);
    } else this.changed();
    this.emit('selection');
  }

  protected editorChanged(): void {
    this.emit('editor');
    this.changed();
  }

  // GM tools ---------------------------------------------------------------

  isGm(): boolean {
    return !!this.you && isGm(this.you);
  }

  /** The GM edits any token; a trusted player the ones they own. */
  canEdit(id: string): boolean {
    const token = this.tokens.get(id);
    return !!this.you && !!token && canEdit(token, this.you);
  }

  focus(point: Point): void {
    this.emit('focus', point);
  }

  canControl(token: Token): boolean {
    return !!this.you && canControl(token, this.you);
  }

  private editTargets(): DocRef[] {
    if (this.editor.selection.length) return this.editor.selection.map(refOf);
    if (this.selected) return [{ coll: `${this.scene}/tokens`, id: this.selected }];
    const sheet = this.sheets.current;
    if (sheet?.kind === 'actor') return [{ coll: 'actors', id: sheet.id }];
    return [];
  }

  private gridSize(): number {
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

  /** A message for one of the session's parts. */
  private applyParts(msg: ServerMessage): boolean {
    for (const part of this.parts) {
      const changed = part.receive?.(msg);
      if (changed !== undefined) return changed;
    }
    return false;
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
    const token = this.turns.current();
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
    this.scene = msg.scene;
    for (const part of this.parts) part.welcome?.(msg);
    this.players = msg.players ?? [];
    this.pluginLoads = msg.plugins ?? [];
    this.actors.clear();
    for (const a of msg.actors ?? []) this.actors.set(a.id, a);
    this.sheets.reopen();
    // A reconnect starts from scratch: ask for the chunks again.
    this.chunks.clear();
    this.emit('welcome');
    for (const t of msg.tokens) this.emit('token', t);
    if (this.view.length) this.send({ t: 'view', chunks: this.view });
    this.send({ t: 'rollMode', mode: this.actions.rollMode });
  }

  private onActor(msg: Extract<ServerMessage, { t: 'actor' | 'actorGone' }>): void {
    if (msg.t === 'actor') this.actors.set(msg.actor.id, msg.actor);
    // A sheet can only be open on an actor the session knows.
    else if (this.actors.delete(msg.id)) this.sheets.close('actor', msg.id);
  }

  private onTokenGone(id: string): boolean {
    if (!this.tokens.delete(id)) return false;
    this.targets.forget(id);
    for (const part of this.parts) part.gone?.(id);
    if (this.editor.mode === 'tokens') this.editor.pruneSelection((key) => key !== this.editor.tokenKey(id));
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

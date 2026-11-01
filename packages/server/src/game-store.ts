import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';
import { DocStore, OpError, revertOps, type Change, type Doc, type Op, type Validate } from '@vtt/core';
import {
  splitWorld,
  type Actor,
  type Chunk,
  type ChunkChange,
  type Combat,
  type DocChange,
  type Game,
  type LightSource,
  type Player,
  type Point,
  type Rect,
  type Token,
  type Wall,
  type World,
} from '@vtt/shared';
import { clientCheck } from './doc-checks.ts';
import { diffOps, fromDoc, toDoc } from './doc-sync.ts';
import { FileWriter } from './file-writer.ts';
import { FogStore } from './fog-store.ts';
import { classify, crossCheck, pathOf } from './game-files.ts';
import { readEntry, readFolder, stateOf, type FolderEntry } from './game-folder.ts';
import { upgradeFolder } from './migrate-all.ts';
import { SceneState } from './scene-state.ts';
import { StoreAccess, type DocAccess } from './store-access.ts';
import type { TYPE } from './store-colls.ts';
import { ACTORS, COMBAT, docsOf, FIGHT, fileOf, GAME, SCENES, sameScene, scopeOf } from './store-colls.ts';
import { StoreHistory, touchedBy, type Touched } from './store-history.ts';
import { sceneDeleteOps } from './scene-ops.ts';
import { actorDeleteOps, chunkOps, putOps, relinkOps, tokenOps, unlinkActorOps, type Relink } from './token-ops.ts';

// Events about one scene name it last.
interface StoreEvents {
  /** game.json changed: the seats, the game's settings or the scene it is on. */
  world: [World];
  /** A scene's settings changed (not just its time of day), or it was made or removed. */
  scene: [string];
  /** Only the time of day changed: no need to start over. */
  lighting: [number, string];
  chunk: [string, Chunk, string];
  chunkGone: [string, string];
  /** `path` is set when the token walked there inside the game. */
  token: [Token, Point[] | undefined, string];
  tokenGone: [string, string];
  actor: [Actor];
  actorGone: [string];
  combat: [Combat | undefined];
  /** Documents changed: what they are now, who changed them (none: a hand edit) and the client's txn. */
  docs: [DocChange[], string | undefined, string | undefined];
}

interface CommitOptions {
  /** The ops came from a file edited by hand: don't write it back. */
  fromDisk?: boolean;
  /** Update the table settings without telling clients (a new seat). */
  quiet?: boolean;
  path?: Point[];
  /** A stricter check for documents a client sent. */
  validate?: Validate;
  txn?: string;
}

/**
 * A game folder (storage v2), held in memory as documents in a core
 * DocStore. The folder is the source of truth: edits made by hand or by
 * Claude are picked up live and turned into ops, and changes made in the
 * game are written back shortly after. Every scene is kept live (see
 * scene-state.ts) and streamed to the clients on it in chunks. The rules read
 * and change "the scene": the one `inScene` names, else the game's.
 */
export class GameStore extends EventEmitter<StoreEvents> {
  readonly docs = new DocStore();
  /** Creatures' sheets, from actors/: what tokens stand for, and the GM's Actors list. */
  readonly actors = new Map<string, Actor>();
  /** The fight in progress, from combat.json. */
  combat?: Combat;
  /** Explored fog of war, per scene and player. */
  readonly fog: FogStore;

  private game!: Game;
  private states = new Map<string, SceneState>();
  private focus?: string;
  private files: FileWriter;
  private dirty = new Map<string, { coll: string; id: string }>();
  /** Files that failed to load: never overwritten until they are fixed. */
  private broken = new Set<string>();
  private saveTimer?: NodeJS.Timeout;
  private pending = new Map<string, NodeJS.Timeout>();
  private watcher?: FSWatcher;
  /** The step being recorded for undo, and who changed each document last. */
  readonly history = new StoreHistory();

  constructor(readonly dir: string) {
    super();
    this.files = new FileWriter(dir);
    this.fog = new FogStore(dir);
  }

  async load(): Promise<void> {
    await upgradeFolder(this.dir);
    const entries = await readFolder(this.dir);
    const game = entries.find((e) => e.kind.kind === 'game');
    if (!game?.file) throw new Error(`game.json is invalid:\n  ${game?.errors.join('\n  ') ?? 'missing'}`);
    const ops = entries.flatMap((e) => this.loaded(e));
    this.docs.apply(ops);
    for (const doc of this.docs.all(ACTORS)) this.actors.set(doc.id, fromDoc<Actor>(doc));
    this.game = fromDoc<Game>(this.docs.all(GAME)[0]!);
    if (!this.docs.get(SCENES, this.game.scene)) {
      throw new Error(`game.json: scene "${this.game.scene}" has no valid scenes/${this.game.scene}/scene.json`);
    }
    this.syncScenes(false);
    this.projectCombat(false);
    await this.fog.load(this.sceneIds());
    this.fog.prune(this.game.players.map((p) => p.id));
    for (const issue of crossCheck(stateOf(entries)!)) console.warn(`[game] ${issue.file}: ${issue.message}`);
    console.log(`[game] loaded "${this.world.name}", ${this.states.size} scenes, on "${this.activeScene}"`);
  }

  /** The create ops for one file read at load time; a broken file is reported and left alone. */
  private loaded(entry: FolderEntry): Op[] {
    if (!entry.file) {
      this.broken.add(entry.rel);
      console.error(`[game] ${entry.rel} ignored:\n  ${entry.errors.join('\n  ')}`);
      return [];
    }
    this.files.remember(entry.rel, entry.text);
    const { coll, docs } = docsOf(entry.file);
    return docs.map((doc): Op => ({ op: 'create', coll, doc }));
  }

  watch(): void {
    this.watcher = watch(this.dir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const rel = filename.split('\\').join('/');
      if (!classify(rel)) return;
      // Editors often write a file in several steps; wait for it to settle.
      clearTimeout(this.pending.get(rel));
      this.pending.set(
        rel,
        setTimeout(() => void this.onFileChanged(rel), 80),
      );
    });
  }

  close(): void {
    this.watcher?.close();
    for (const t of this.pending.values()) clearTimeout(t);
  }

  /** Resolves once every change has reached the disk. */
  async flush(): Promise<void> {
    this.save();
    await Promise.all([this.files.flush(), this.fog.flush()]);
  }

  // Reading

  /** game.json as it is now: the campaign's name, system, rules and seats. */
  get campaign(): Game {
    return this.game;
  }

  /** The scene the game is on. */
  get activeScene(): string {
    return this.game.scene;
  }

  /** The scene the rules read and change now: the one `inScene` names, else the game's. */
  get currentScene(): string {
    return this.here.id;
  }

  /** The settings of the current scene, merged with the game's. */
  get world(): World {
    return this.here.world;
  }

  /** The current scene's map, cut into streaming chunks. */
  get chunks(): ReadonlyMap<string, Chunk> {
    return this.here.chunks;
  }

  /** Tokens on the current scene, each merged with its actor (see token-link.ts). */
  get tokens(): ReadonlyMap<string, Token> {
    return this.here.tokens;
  }

  /** Every scene's id. */
  sceneIds(): string[] {
    return [...this.states.keys()];
  }

  hasScene(id: string): boolean {
    return this.states.has(id);
  }

  /** The name a scene shows, or its id. */
  sceneName(id: string): string {
    return this.states.get(id)?.scene.name ?? id;
  }

  /** Runs `fn` with `scene` as the scene the rules read and change. */
  inScene<T>(scene: string, fn: () => T): T {
    if (!this.states.has(scene)) throw new Error(`no scene "${scene}"`);
    const before = this.focus;
    this.focus = scene;
    try {
      return fn();
    } finally {
      this.focus = before;
    }
  }

  private get here(): SceneState {
    return this.states.get(this.focus ?? this.game.scene)!;
  }

  wallsIn(rect: Rect): Wall[] {
    return this.here.wallsIn(rect);
  }

  wallsBetween(a: Point, b: Point): Wall[] {
    const scene: SceneState = this.here;
    return scene.wallsBetween(a, b);
  }

  /** Every light on the current scene: placed ones and those tokens carry. */
  lights(): LightSource[] {
    const scene: SceneState = this.here;
    return scene.lights();
  }

  // Changing

  /** Replaces the table settings (of the current scene), e.g. when the GM changes someone's role. */
  setWorld(world: World): void {
    this.commit(this.worldOps(world));
  }

  /** Changes game.json alone: the seats, or the scene the game is on. */
  setGame(change: Partial<Pick<Game, 'scene' | 'players'>>): void {
    this.commit(this.putOps(GAME, toDoc('game', { ...this.game, ...change })));
  }

  setDarkness(darkness: number): void {
    this.setWorld({ ...this.world, darkness });
  }

  /**
   * Seats a new player (an account joining). Connected clients are left
   * alone: unlike a hand edit of game.json, this doesn't restart the table.
   */
  addPlayer(player: Player): void {
    if (this.world.players.some((p) => p.id === player.id)) return;
    this.commit(this.worldOps({ ...this.world, players: [...this.world.players, player] }), { quiet: true });
  }

  /**
   * Saves a changed token: a linked token's sheet goes to its actor (so its
   * other tokens change too), an unlinked one keeps what differs as its delta.
   */
  setToken(token: Token, path?: Point[]): void {
    const ops = tokenOps(this.docs, this.sceneColl('tokens'), token, this.actors);
    if (ops.length) this.commit(ops, { path });
    else this.emit('token', token, path, this.here.id);
  }

  /** Changes a token's tie to its actor. The caller checks the token has an actor. */
  relinkToken(id: string, how: Relink): void {
    this.commit(relinkOps(this.docs, this.sceneColl('tokens'), { id, how }, this.actors));
  }

  /** Deletes a token (a summon that vanished). */
  removeToken(id: string): void {
    this.commit(this.deleteOps(this.sceneColl('tokens'), id));
  }

  setActor(actor: Actor): void {
    this.commit(this.putOps(ACTORS, toDoc('actor', actor)));
  }

  /** Deletes an actor; its tokens on every scene keep its sheet as their own. */
  removeActor(id: string): void {
    const scenes = this.docs.all(SCENES).map((d) => d.id);
    this.commit([...unlinkActorOps(this.docs, scenes, id, this.actors.get(id)), ...this.deleteOps(ACTORS, id)]);
  }

  setCombat(combat: Combat | undefined): void {
    const ops = combat ? this.putOps(COMBAT, toDoc('combat', combat, FIGHT)) : this.deleteOps(COMBAT, FIGHT);
    if (ops.length) this.commit(ops);
    else this.emit('combat', combat);
  }

  setChunk(key: string, chunk: Chunk): void {
    this.setChunks([{ key, chunk }]);
  }

  /** Saves map edits given as whole chunks (see applyMapEdit): items that left them are deleted. */
  setChunks(changes: readonly ChunkChange[]): void {
    this.commit(chunkOps(this.docs, this.here.id, changes, this.here.chunks));
  }

  /**
   * GM: applies a transaction a client sent, checked like the files it is
   * saved in. Deleting an actor leaves its tokens carrying its sheet.
   * Throws an OpError (nothing applied) when any op can't be.
   */
  applyOps(ops: readonly Op[], txn?: string): void {
    const scenes = this.docs.all(SCENES).map((d) => d.id);
    const made = new Set(ops.flatMap((op) => (op.op === 'create' && op.coll === SCENES ? [op.doc.id] : [])));
    const validate = clientCheck((id) => made.has(id) || !!this.docs.get(SCENES, id));
    const extra = [
      ...actorDeleteOps(this.docs, scenes, ops, this.actors),
      ...sceneDeleteOps(this.docs, this.game, ops),
    ];
    this.commit([...extra, ...ops], { validate, txn });
  }

  // Undo

  /** Runs `fn` and returns what it changed in the documents, as one undo step by player `by`. */
  record(by: string, fn: () => void): Change[] {
    return this.history.record(by, this.docs, fn);
  }

  /** Puts back what a step changed. Throws a RevisionError when a document has moved on since. */
  revert(changes: readonly Change[]): void {
    this.commit(revertOps(this.docs, changes));
  }

  /** Documents as ownership sees them (op-permissions.ts, doc-feed.ts). */
  get access(): DocAccess {
    return new StoreAccess(this.docs, this.actors);
  }

  // Ops

  private sceneColl(coll: keyof typeof TYPE): string {
    return this.here.coll(coll);
  }

  private putOps(coll: string, doc: Doc): Op[] {
    return putOps(this.docs, coll, doc);
  }

  private deleteOps(coll: string, id: string): Op[] {
    return this.docs.get(coll, id) ? [{ op: 'delete', coll, id }] : [];
  }

  private worldOps(world: World): Op[] {
    const here = this.here;
    const { game, scene } = splitWorld(world, this.game, here.scene);
    return [...this.putOps(GAME, toDoc('game', game)), ...this.putOps(SCENES, toDoc('scene', scene, here.id))];
  }

  /** Applies a transaction, updates what the game reads, tells listeners and saves. */
  private commit(ops: readonly Op[], opts: CommitOptions = {}): void {
    if (!ops.length) return;
    const touched = touchedBy(ops, (coll, id) => this.docs.get(coll, id));
    this.docs.apply(ops, opts.validate && { validate: opts.validate });
    this.history.committed(touched, !!opts.fromDisk);
    this.project(touched, opts);
    const changes = touched.map((t) => ({ coll: t.coll, id: t.id, doc: this.docs.get(t.coll, t.id) }));
    this.emit('docs', changes, opts.fromDisk ? undefined : this.history.author, opts.txn);
    if (opts.fromDisk) return;
    for (const t of touched) this.dirty.set(pathOf(fileOf(t.coll, t.id)), t);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 50);
  }

  // Projections: what the game reads, kept in step with the documents.

  private project(touched: readonly Touched[], opts: CommitOptions): void {
    const keys = new Map<string, Set<string>>();
    const moved = new Map<string, Set<string>>();
    const actors = new Set<string>();
    let world = false;
    for (const t of touched) {
      if (t.coll === GAME || t.coll === SCENES) world = true;
      else if (t.coll === ACTORS) actors.add(t.id);
      else if (t.coll === COMBAT) this.projectCombat(true);
      else this.sceneTouched(t, { keys, moved });
    }
    // New and removed scenes first, so their documents have somewhere to go.
    if (world) this.refreshWorld({ quiet: opts.quiet });
    for (const id of actors) this.projectActor(id);
    for (const state of this.states.values()) {
      projectScene(state, { moved: moved.get(state.id), keys: keys.get(state.id), actors, path: opts.path });
    }
  }

  /** Notes which token or chunks of which scene a change touched. */
  private sceneTouched(t: Touched, into: { keys: Map<string, Set<string>>; moved: Map<string, Set<string>> }): void {
    const [scene, coll] = t.coll.split('/') as [string, string];
    const state = this.states.get(scene);
    if (!state) return;
    const add = (map: Map<string, Set<string>>) => map.get(scene) ?? map.set(scene, new Set()).get(scene)!;
    if (coll === 'tokens') add(into.moved).add(t.id);
    else state.chunkKeys(t, add(into.keys));
  }

  private projectActor(id: string): void {
    const doc = this.docs.get(ACTORS, id);
    if (doc) this.actors.set(id, fromDoc<Actor>(doc));
    if (doc) this.emit('actor', this.actors.get(id)!);
    else if (this.actors.delete(id)) this.emit('actorGone', id);
  }

  private projectCombat(live: boolean): void {
    const doc = this.docs.get(COMBAT, FIGHT);
    this.combat = doc && fromDoc<Combat>(doc, false);
    if (live) this.emit('combat', this.combat);
  }

  /** A scene state for every scene document, with its events tagged with its id. */
  private syncScenes(live: boolean): string[] {
    const changed: string[] = [];
    const ids = new Set(this.docs.all(SCENES).map((d) => d.id));
    for (const id of [...this.states.keys()].filter((k) => !ids.has(k))) {
      this.states.delete(id);
      changed.push(id);
    }
    for (const id of ids) {
      if (this.states.has(id)) continue;
      const state = new SceneState(id, this.docs, this.actors, {
        chunk: (key, chunk) => this.emit('chunk', key, chunk, id),
        chunkGone: (key) => this.emit('chunkGone', key, id),
        token: (token, path) => this.emit('token', token, path, id),
        tokenGone: (tid) => this.emit('tokenGone', tid, id),
      });
      state.rebuild();
      this.states.set(id, state);
      if (live) changed.push(id);
    }
    return changed;
  }

  private refreshWorld({ quiet }: { quiet?: boolean }): void {
    const game = fromDoc<Game>(this.docs.all(GAME)[0]!);
    if (!this.docs.get(SCENES, game.scene)) {
      console.error(`[game] game.json: scene "${game.scene}" has no scene.json`);
      return;
    }
    const before = this.game;
    this.game = game;
    this.fog.prune(game.players.map((p) => p.id));
    const worlds = new Map([...this.states].map(([id, s]) => [id, s.world]));
    const changed = new Set(this.syncScenes(true));
    for (const state of this.states.values()) {
      const old = worlds.get(state.id);
      if (state.settle(game) || !old) changed.add(state.id);
      else if (!sameScene(old, state.world)) changed.add(state.id);
      else if (old.darkness !== state.world.darkness && !quiet) this.emit('lighting', state.world.darkness, state.id);
    }
    if (quiet) return;
    if (JSON.stringify(before) !== JSON.stringify(game)) this.emit('world', this.world);
    for (const id of changed) this.emit('scene', id);
  }

  // Files

  private async onFileChanged(rel: string): Promise<void> {
    this.pending.delete(rel);
    const entry = await readEntry(this.dir, rel);
    if (entry && this.files.isOurs(rel, entry.text)) return;
    if (entry && !entry.file) {
      this.broken.add(rel);
      console.error(`[game] ${rel} ignored:\n  ${entry.errors.join('\n  ')}`);
      return;
    }
    this.broken.delete(rel);
    if (entry) this.files.remember(rel, entry.text);
    const scope = entry?.file ? docsOf(entry.file) : scopeOf(classify(rel)!);
    if (!scope) return;
    console.log(`[game] reloading ${rel}`);
    this.reload(rel, scope);
  }

  /** Brings the documents a file holds in line with what it says now. */
  private reload(rel: string, { coll, only, docs = [] }: { coll: string; only?: string; docs?: Doc[] }): void {
    const current = only ? [this.docs.get(coll, only)].filter((d) => !!d) : this.docs.all(coll);
    try {
      this.commit(diffOps(coll, current, docs), { fromDisk: true });
    } catch (e) {
      if (!(e instanceof OpError)) throw e;
      console.error(`[game] ${rel} ignored: ${e.message}`);
    }
  }

  /** Writes every file with unsaved changes. */
  private save(): void {
    clearTimeout(this.saveTimer);
    for (const [rel, { coll, id }] of this.dirty) {
      if (this.broken.has(rel)) {
        console.error(`[game] not saving ${rel}: it failed to load, fix it by hand first`);
        continue;
      }
      const data = this.fileData(coll, id);
      if (data === undefined) this.files.remove(rel);
      else this.files.write(rel, data);
    }
    this.dirty.clear();
  }

  /** What a document's file should hold now; undefined when the file should go. */
  private fileData(coll: string, id: string): unknown {
    if (coll === GAME) return fromDoc(this.docs.all(GAME)[0]!);
    if (coll === ACTORS) return this.docs.get(coll, id) && fromDoc(this.docs.get(coll, id)!);
    if (coll === SCENES || coll === COMBAT) return this.docs.get(coll, id) && fromDoc(this.docs.get(coll, id)!, false);
    // A deleted scene takes its collection files with it.
    if (!this.docs.get(SCENES, coll.split('/')[0]!)) return undefined;
    return this.docs.all(coll).map((d) => fromDoc(d));
  }
}

/** Brings a scene's tokens and chunks in step: tokens that moved, tokens of changed actors, touched chunks. */
function projectScene(
  state: SceneState,
  { moved, keys, actors, path }: { moved?: Set<string>; keys?: Set<string>; actors: Set<string>; path?: Point[] },
): void {
  const mine = moved ?? new Set<string>();
  for (const id of mine) state.projectToken(id, path);
  for (const id of state.tokensOf(actors)) if (!mine.has(id)) state.projectToken(id);
  if (keys?.size) state.refreshChunks(keys, true);
}

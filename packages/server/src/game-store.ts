import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';
import { DocStore, OpError, type Doc, type Op } from '@vtt/core';
import {
  anchorChunk,
  chunksInRect,
  groupChunks,
  splitWorld,
  tokenLights,
  worldOf,
  type Actor,
  type Chunk,
  type ChunkChange,
  type Combat,
  type Game,
  type LightSource,
  type MapCollection,
  type Player,
  type Point,
  type Rect,
  type Scene,
  type Token,
  type Wall,
  type World,
} from '@vtt/shared';
import { diffOps, fromDoc, toDoc } from './doc-sync.ts';
import { FileWriter } from './file-writer.ts';
import { classify, crossCheck, pathOf, type FileKind, type GameFile } from './game-files.ts';
import { readEntry, readFolder, stateOf, type FolderEntry } from './game-folder.ts';
import { migrateFolder } from './migrate-world.ts';

interface StoreEvents {
  world: [World];
  /** Only the time of day changed: no need to start over. */
  lighting: [number];
  chunk: [string, Chunk];
  chunkGone: [string];
  /** `path` is set when the token walked there inside the game. */
  token: [Token, Point[] | undefined];
  tokenGone: [string];
  actor: [Actor];
  actorGone: [string];
  combat: [Combat | undefined];
}

// Collections in the document store. A scene's placeables live in
// "<scene>/<collection>", e.g. "crossroads/walls".
const GAME = 'game';
const SCENES = 'scenes';
const ACTORS = 'actors';
const COMBAT = 'combat';
const FIGHT = 'current';
const MAP: MapCollection[] = ['tiles', 'walls', 'lights'];
const TYPE = { tiles: 'tile', walls: 'wall', lights: 'light', tokens: 'token' } as const;

/** Where a file's documents go, and which of them it covers (all of `coll`, or just `only`). */
function docsOf(file: GameFile): { coll: string; only?: string; docs: Doc[] } {
  switch (file.kind) {
    case 'game':
      return { coll: GAME, docs: [toDoc('game', file.data)] };
    case 'combat':
      return { coll: COMBAT, docs: [toDoc('combat', file.data, FIGHT)] };
    case 'actor':
      return { coll: ACTORS, only: file.id, docs: [toDoc('actor', file.data)] };
    case 'scene':
      return { coll: SCENES, only: file.scene, docs: [toDoc('scene', file.data, file.scene)] };
    case 'collection':
      return { coll: `${file.scene}/${file.coll}`, docs: file.data.map((item) => toDoc(TYPE[file.coll], item)) };
  }
}

/** The file a document is saved in. */
function fileOf(coll: string, id: string): FileKind {
  if (coll === GAME || coll === COMBAT) return { kind: coll };
  if (coll === ACTORS) return { kind: 'actor', id };
  if (coll === SCENES) return { kind: 'scene', scene: id };
  const [scene, name] = coll.split('/') as [string, keyof typeof TYPE];
  return { kind: 'collection', scene, coll: name };
}

/** The document collection a deleted file emptied, and which of its documents it held. */
function scopeOf(kind: FileKind): { coll: string; only?: string } | undefined {
  if (kind.kind === 'game' || kind.kind === 'scene') return undefined;
  if (kind.kind === 'actor') return { coll: ACTORS, only: kind.id };
  if (kind.kind === 'combat') return { coll: COMBAT };
  return { coll: `${kind.scene}/${kind.coll}` };
}

interface Touched {
  coll: string;
  id: string;
  before?: Doc;
}

interface CommitOptions {
  /** The ops came from a file edited by hand: don't write it back. */
  fromDisk?: boolean;
  /** Update the table settings without telling clients (a new seat). */
  quiet?: boolean;
  path?: Point[];
}

/**
 * A game folder (storage v2), held in memory as documents in a core
 * DocStore. The folder is the source of truth: edits made by hand or by
 * Claude are picked up live and turned into ops, and changes made in the
 * game are written back shortly after. The server streams the active scene
 * to clients in chunks, cut from the scene by position.
 */
export class GameStore extends EventEmitter<StoreEvents> {
  readonly docs = new DocStore();
  world!: World;
  /** The active scene's map, cut into streaming chunks. */
  readonly chunks = new Map<string, Chunk>();
  /** Tokens on the active scene. */
  readonly tokens = new Map<string, Token>();
  /** The GM's Actors list: creatures ready to be placed, from actors/. */
  readonly actors = new Map<string, Actor>();
  /** The fight in progress, from combat.json. */
  combat?: Combat;

  private game!: Game;
  private scene!: Scene;
  private sceneId = '';
  private files: FileWriter;
  private dirty = new Map<string, { coll: string; id: string }>();
  /** Files that failed to load: never overwritten until they are fixed. */
  private broken = new Set<string>();
  private saveTimer?: NodeJS.Timeout;
  private pending = new Map<string, NodeJS.Timeout>();
  private watcher?: FSWatcher;

  constructor(readonly dir: string) {
    super();
    this.files = new FileWriter(dir);
  }

  async load(): Promise<void> {
    const migrated = await migrateFolder(this.dir);
    if (migrated) {
      console.log(`[game] moved the old world files to the game layout; originals kept in ${migrated.backup}`);
      for (const note of migrated.notes) console.log(`[game]   ${note}`);
    }
    const entries = await readFolder(this.dir);
    const game = entries.find((e) => e.kind.kind === 'game');
    if (!game?.file) throw new Error(`game.json is invalid:\n  ${game?.errors.join('\n  ') ?? 'missing'}`);
    const ops = entries.flatMap((e) => this.loaded(e));
    this.docs.apply(ops);
    this.refreshWorld({ live: false });
    if (!this.docs.get(SCENES, this.game.scene)) {
      throw new Error(`game.json: scene "${this.game.scene}" has no valid scenes/${this.game.scene}/scene.json`);
    }
    for (const issue of crossCheck(stateOf(entries)!)) console.warn(`[game] ${issue.file}: ${issue.message}`);
    console.log(`[game] loaded "${this.world.name}", scene "${this.sceneId}": ${this.tokens.size} tokens`);
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
    await this.files.flush();
  }

  // Reading

  wallsIn(rect: Rect): Wall[] {
    const walls: Wall[] = [];
    for (const key of chunksInRect(rect, this.world.chunkSize)) {
      const c = this.chunks.get(key);
      if (c) walls.push(...c.walls);
    }
    return walls;
  }

  wallsBetween(a: Point, b: Point): Wall[] {
    return this.wallsIn({
      x: Math.min(a[0], b[0]) - 1,
      y: Math.min(a[1], b[1]) - 1,
      w: Math.abs(a[0] - b[0]) + 2,
      h: Math.abs(a[1] - b[1]) + 2,
    });
  }

  /** Every light on the scene: placed ones and those tokens carry. */
  lights(): LightSource[] {
    const out: LightSource[] = [];
    for (const c of this.chunks.values()) out.push(...c.lights);
    out.push(...tokenLights(this.tokens.values()));
    return out;
  }

  // Changing

  /** Replaces the table settings, e.g. when the GM changes someone's role. */
  setWorld(world: World): void {
    this.commit(this.worldOps(world));
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

  setToken(token: Token, path?: Point[]): void {
    const ops = this.putOps(this.sceneColl('tokens'), toDoc('token', token));
    if (ops.length) this.commit(ops, { path });
    else this.emit('token', token, path);
  }

  /** Deletes a token (a summon that vanished). */
  removeToken(id: string): void {
    this.commit(this.deleteOps(this.sceneColl('tokens'), id));
  }

  setActor(actor: Actor): void {
    this.commit(this.putOps(ACTORS, toDoc('actor', actor)));
  }

  removeActor(id: string): void {
    this.commit(this.deleteOps(ACTORS, id));
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
    const ops: Op[] = [];
    for (const coll of MAP) {
      const name = this.sceneColl(coll);
      const items = (chunk: Chunk | undefined): { id: string }[] => chunk?.[coll] ?? [];
      const wanted = changes.flatMap((c) => items(c.chunk)).map((item) => toDoc(TYPE[coll], item));
      const ids = new Set(wanted.map((d) => d.id));
      const current = changes.flatMap((c) => items(this.chunks.get(c.key))).map((item) => item.id);
      for (const doc of wanted) ops.push(...this.putOps(name, doc));
      for (const id of current.filter((i) => !ids.has(i))) ops.push(...this.deleteOps(name, id));
    }
    this.commit(ops);
  }

  // Ops

  private sceneColl(coll: keyof typeof TYPE): string {
    return `${this.sceneId}/${coll}`;
  }

  private putOps(coll: string, doc: Doc): Op[] {
    const old = this.docs.get(coll, doc.id);
    return diffOps(coll, old ? [old] : [], [doc]);
  }

  private deleteOps(coll: string, id: string): Op[] {
    return this.docs.get(coll, id) ? [{ op: 'delete', coll, id }] : [];
  }

  private worldOps(world: World): Op[] {
    const { game, scene } = splitWorld(world, this.game, this.scene);
    return [...this.putOps(GAME, toDoc('game', game)), ...this.putOps(SCENES, toDoc('scene', scene, this.sceneId))];
  }

  /** Applies a transaction, updates what the game reads, tells listeners and saves. */
  private commit(ops: readonly Op[], opts: CommitOptions = {}): void {
    if (!ops.length) return;
    const touched = new Map<string, Touched>();
    for (const op of ops) {
      const id = op.op === 'create' ? op.doc.id : op.id;
      const key = `${op.coll}\u0000${id}`;
      if (!touched.has(key)) touched.set(key, { coll: op.coll, id, before: this.docs.get(op.coll, id) });
    }
    this.docs.apply(ops);
    this.project([...touched.values()], opts);
    if (opts.fromDisk) return;
    for (const t of touched.values()) this.dirty.set(pathOf(fileOf(t.coll, t.id)), t);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 50);
  }

  // Projections: the maps the game reads, kept in step with the documents.

  private project(touched: readonly Touched[], opts: CommitOptions): void {
    const keys = new Set<string>();
    let world = false;
    for (const t of touched) {
      if (t.coll === GAME || t.coll === SCENES) world = true;
      else if (t.coll === ACTORS) this.projectActor(t.id);
      else if (t.coll === COMBAT) this.projectCombat();
      else if (t.coll === this.sceneColl('tokens')) this.projectToken(t.id, opts.path);
      else this.chunkKeys(t, keys);
    }
    if (world) this.refreshWorld({ live: true, quiet: opts.quiet });
    if (keys.size) this.refreshChunks(keys, true);
  }

  private projectActor(id: string): void {
    const doc = this.docs.get(ACTORS, id);
    if (doc) this.actors.set(id, fromDoc<Actor>(doc));
    if (doc) this.emit('actor', this.actors.get(id)!);
    else if (this.actors.delete(id)) this.emit('actorGone', id);
  }

  private projectCombat(): void {
    const doc = this.docs.get(COMBAT, FIGHT);
    this.combat = doc && fromDoc<Combat>(doc, false);
    this.emit('combat', this.combat);
  }

  private projectToken(id: string, path?: Point[]): void {
    const doc = this.docs.get(this.sceneColl('tokens'), id);
    if (doc) this.tokens.set(id, fromDoc<Token>(doc));
    if (doc) this.emit('token', this.tokens.get(id)!, path);
    else if (this.tokens.delete(id)) this.emit('tokenGone', id);
  }

  /** The chunks a map item was in and is in now, if it is on the active scene. */
  private chunkKeys(t: Touched, keys: Set<string>): void {
    const coll = MAP.find((c) => t.coll === this.sceneColl(c));
    if (!coll) return;
    for (const doc of [t.before, this.docs.get(t.coll, t.id)]) {
      if (doc) keys.add(anchorChunk(coll, fromDoc(doc), this.world.chunkSize));
    }
  }

  private sceneMap(): Chunk {
    const items = (coll: MapCollection) => this.docs.all(this.sceneColl(coll)).map((d) => fromDoc(d));
    return {
      tiles: items('tiles') as Chunk['tiles'],
      walls: items('walls') as Wall[],
      lights: items('lights') as Chunk['lights'],
    };
  }

  private refreshChunks(keys: ReadonlySet<string> | undefined, live: boolean): void {
    if (!keys) this.chunks.clear();
    for (const [key, chunk] of groupChunks(this.sceneMap(), this.world.chunkSize, keys)) {
      const empty = !chunk.tiles.length && !chunk.walls.length && !chunk.lights.length;
      const had = this.chunks.has(key);
      if (empty) this.chunks.delete(key);
      else this.chunks.set(key, chunk);
      if (live && empty && had) this.emit('chunkGone', key);
      else if (live && !empty) this.emit('chunk', key, chunk);
    }
  }

  /** Rebuilds everything that depends on which scene is active. */
  private refreshScene(): void {
    this.tokens.clear();
    for (const doc of this.docs.all(this.sceneColl('tokens'))) this.tokens.set(doc.id, fromDoc<Token>(doc));
    this.refreshChunks(undefined, false);
    this.actors.clear();
    for (const doc of this.docs.all(ACTORS)) this.actors.set(doc.id, fromDoc<Actor>(doc));
    const fight = this.docs.get(COMBAT, FIGHT);
    this.combat = fight && fromDoc<Combat>(fight, false);
  }

  private refreshWorld({ live, quiet }: { live: boolean; quiet?: boolean }): void {
    const game = fromDoc<Game>(this.docs.all(GAME)[0]!);
    const sceneDoc = this.docs.get(SCENES, game.scene);
    this.game = game;
    if (!sceneDoc) {
      console.error(`[game] game.json: scene "${game.scene}" has no scene.json`);
      return;
    }
    const before = this.world as World | undefined;
    const moved = game.scene !== this.sceneId || before?.chunkSize !== (sceneDoc.chunkSize as number);
    this.sceneId = game.scene;
    this.scene = fromDoc<Scene>(sceneDoc, false);
    this.world = worldOf(game, this.scene);
    if (moved) this.refreshScene();
    if (live && !quiet && before) this.announceWorld(before, moved);
  }

  private announceWorld(before: World, moved: boolean): void {
    if (JSON.stringify(before) === JSON.stringify(this.world)) return;
    if (!moved && onlyDarknessChanged(before, this.world)) this.emit('lighting', this.world.darkness);
    else this.emit('world', this.world);
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
    return this.docs.all(coll).map((d) => fromDoc(d));
  }
}

/** True when two table settings differ in nothing but the time of day. */
function onlyDarknessChanged(a: World, b: World): boolean {
  return JSON.stringify({ ...a, darkness: 0 }) === JSON.stringify({ ...b, darkness: 0 });
}

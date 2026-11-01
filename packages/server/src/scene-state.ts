import type { Doc, DocStore } from '@vtt/core';
import {
  anchorChunk,
  type Chunk,
  chunksInRect,
  type Game,
  groupChunks,
  isGroup,
  type LightSource,
  type MapCollection,
  type Point,
  type Rect,
  type Scene,
  tokenLights,
  type Wall,
  type World,
  worldOf,
} from '@vtt/shared';
import { type Actor, resolveToken, type Token, type TokenEntry } from '@vtt/system-dnd5e';
import { fromDoc } from './doc-sync.ts';
import { drawnTiles, reordersTiles } from './scene-map.ts';
import { MAP } from './store-colls.ts';
import type { Touched } from './store-history.ts';

// One scene as the game reads it: its settings merged with the game's, its
// map cut into streaming chunks, and its tokens merged with their actors.
// Every scene of a game is kept like this, so players can be on different
// scenes and the GM can prepare one while the party plays on another.

/** What a scene tells the store about its chunks and tokens. */
export interface SceneEvents {
  chunk(key: string, chunk: Chunk): void;
  chunkGone(key: string): void;
  token(token: Token, path: Point[] | undefined): void;
  tokenGone(id: string): void;
}

export class SceneState {
  readonly chunks = new Map<string, Chunk>();
  readonly tokens = new Map<string, Token>();
  world: World;
  scene: Scene;

  constructor(
    readonly id: string,
    private docs: DocStore,
    private actors: ReadonlyMap<string, Actor>,
    private events: SceneEvents,
  ) {
    this.scene = fromDoc<Scene>(docs.get('scenes', id)!, false);
    this.world = worldOf(fromDoc<Game>(docs.all('game')[0]!), this.scene);
  }

  coll(name: MapCollection | 'tokens'): string {
    return `${this.id}/${name}`;
  }

  /** Takes new settings; true when the chunks had to be cut again (a new chunk size). */
  settle(game: Game): boolean {
    const before = this.world.chunkSize;
    this.scene = fromDoc<Scene>(this.docs.get('scenes', this.id)!, false);
    this.world = worldOf(game, this.scene);
    if (before === this.world.chunkSize) return false;
    this.refreshChunks(undefined, false);
    return true;
  }

  /** Builds the chunks and tokens from scratch, telling nobody. */
  rebuild(): void {
    this.tokens.clear();
    for (const doc of this.docs.all(this.coll('tokens'))) {
      const token = this.resolve(doc);
      if (token) this.tokens.set(doc.id, token);
    }
    this.refreshChunks(undefined, false);
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

  // Projecting changed documents

  /** Ids of this scene's tokens that stand for one of `actors`. */
  tokensOf(actors: ReadonlySet<string>): string[] {
    if (!actors.size) return [];
    const docs = this.docs.all(this.coll('tokens'));
    return docs.filter((d) => typeof d.actor === 'string' && actors.has(d.actor)).map((d) => d.id);
  }

  projectToken(id: string, path?: Point[]): void {
    const doc = this.docs.get(this.coll('tokens'), id);
    const token = doc && this.resolve(doc);
    if (token) this.tokens.set(id, token);
    if (token) this.events.token(token, path);
    else if (this.tokens.delete(id)) this.events.tokenGone(id);
  }

  /** The chunks a map item was in and is in now. */
  chunkKeys(t: Touched, keys: Set<string>): void {
    const coll = MAP.find((c) => t.coll === this.coll(c));
    if (!coll) return;
    const now = this.docs.get(t.coll, t.id);
    for (const doc of [t.before, now]) {
      if (doc && !isGroup(doc)) keys.add(anchorChunk(coll, fromDoc(doc), this.world.chunkSize));
    }
    if (coll === 'tiles' && reordersTiles(t.before, now)) {
      for (const [key, chunk] of this.chunks) if (chunk.tiles.length) keys.add(key);
    }
  }

  refreshChunks(keys: ReadonlySet<string> | undefined, live: boolean): void {
    if (!keys) this.chunks.clear();
    for (const [key, chunk] of groupChunks(this.map(), this.world.chunkSize, keys)) {
      const empty = !chunk.tiles.length && !chunk.walls.length && !chunk.lights.length;
      const had = this.chunks.has(key);
      if (empty) this.chunks.delete(key);
      else this.chunks.set(key, chunk);
      if (live && empty && had) this.events.chunkGone(key);
      else if (live && !empty) this.events.chunk(key, chunk);
    }
  }

  /** The creature a stored token is, or undefined (and a message) when it can't be put together. */
  private resolve(doc: Doc): Token | undefined {
    const entry = fromDoc<TokenEntry>(doc);
    const { token, errors } = resolveToken(entry, entry.actor ? this.actors.get(entry.actor) : undefined);
    if (!token) console.error(`[game] token "${entry.id}" left out: ${errors.join('; ')}`);
    return token;
  }

  private map(): Chunk {
    const items = (coll: MapCollection) => this.docs.all(this.coll(coll)).map((d) => fromDoc(d));
    return {
      tiles: drawnTiles(this.docs.all(this.coll('tiles'))),
      walls: items('walls') as Wall[],
      lights: items('lights') as Chunk['lights'],
    };
  }
}

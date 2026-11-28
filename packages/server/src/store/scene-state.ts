import type { Doc, DocStore } from '@vtt/core';
import {
  lightShines,
  anchorChunk,
  type Chunk,
  chunksInRect,
  type Clock,
  CLOCK_COLL,
  CLOCK_ID,
  ClockSchema,
  darknessAt,
  timeNow,
  floorLights,
  type Game,
  type Indoors,
  indoorsOn,
  intoWhole,
  partZ,
  groupChunks,
  isGroup,
  type LightSource,
  type MapCollection,
  type Point,
  type Rect,
  type Scene,
  type SceneCollection,
  type LaidPart,
  partFloors,
  type Wall,
  type Weather,
  weatherAt,
  WeatherCycleSchema,
  type World,
  worldOf,
} from '@vtt/shared';
import { type Actor, lightOf, resolveToken, type Token, type TokenEntry } from '@vtt/system-dnd5e';
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

/** Where a store hears of its scenes: events named as SceneEvents, the scene's id last. */
interface SceneEmitter {
  emit(event: keyof SceneEvents, ...args: unknown[]): boolean;
}

/** A scene's events, passed on to the store tagged with the scene's id. */
export function taggedEvents(to: SceneEmitter, id: string): SceneEvents {
  return {
    chunk: (key, chunk) => to.emit('chunk', key, chunk, id),
    chunkGone: (key) => to.emit('chunkGone', key, id),
    token: (token, path) => to.emit('token', token, path, id),
    tokenGone: (tid) => to.emit('tokenGone', tid, id),
  };
}

export class SceneState {
  readonly chunks = new Map<string, Chunk>();
  readonly tokens = new Map<string, Token>();
  scene: Scene;
  /** The game's settings and this scene's, with the darkness the scene has set. */
  private base: World;
  private clock?: { doc: Doc | undefined; clock: Clock };
  /** The indoors of each scene laid here ("<scene>|<floor>"), worked out when first asked for after its map changed. */
  private rooms = new Map<string, Indoors | undefined>();
  /** The map of the scene and of each part as it lies here, kept until one of its items changes. */
  private laid = new Map<string, Chunk>();
  /** The scenes laid on this one (a combined scene, scene-parts.ts): those of scene.json `parts` that can be. */
  parts: LaidPart[] = [];

  constructor(
    readonly id: string,
    private docs: DocStore,
    private actors: ReadonlyMap<string, Actor>,
    private events: SceneEvents,
  ) {
    this.scene = fromDoc<Scene>(docs.get('scenes', id)!, false);
    this.base = worldOf(fromDoc<Game>(docs.all('game')[0]!), this.scene);
    this.parts = this.laidParts();
  }

  /** The parts that can be laid (other scenes of the game, each once, none made of parts itself), each with how its floors map onto this scene's. */
  private laidParts(): LaidPart[] {
    const seen = new Set([this.id]);
    return (this.scene.parts ?? []).flatMap((p) => {
      const doc = this.docs.get('scenes', p.scene);
      const part = doc && fromDoc<Scene>(doc, false);
      const fits = !!part && !seen.has(p.scene) && !part.parts?.length;
      seen.add(p.scene);
      if (!fits) return [];
      const floors = partFloors(part.levels, this.scene.levels);
      return [floors ? { ...p, floors } : p];
    });
  }

  /**
   * The settings the scene is played with: on a scene that follows the clock,
   * darkness is the time of day; with a weather cycle, the weather is the
   * time's (see weather-cycle.ts). Neither is stored.
   */
  get world(): World {
    const { darknessFollowsClock, weatherCycle } = this.scene;
    if (!darknessFollowsClock && !weatherCycle) return this.base;
    const clock = this.gameClock();
    const now = timeNow(clock, Date.now());
    const cycle = weatherCycle && WeatherCycleSchema.safeParse(weatherCycle).data;
    return {
      ...this.base,
      ...(darknessFollowsClock && { darkness: darknessAt(clock.calendar, now) }),
      ...(cycle && { weather: weatherAt(cycle, clock.calendar, now, this.id) }),
    };
  }

  private gameClock(): Clock {
    const doc = this.docs.get(CLOCK_COLL, CLOCK_ID);
    if (!this.clock || this.clock.doc !== doc) {
      this.clock = { doc, clock: ClockSchema.parse(doc ? fromDoc(doc, false) : {}) };
    }
    return this.clock.clock;
  }

  coll(name: SceneCollection): string {
    return `${this.id}/${name}`;
  }

  /** Takes new settings; true when the chunks had to be cut again (a new chunk size, other parts). */
  settle(game: Game): boolean {
    const before = JSON.stringify([this.world.chunkSize, this.parts]);
    this.scene = fromDoc<Scene>(this.docs.get('scenes', this.id)!, false);
    this.base = worldOf(game, this.scene);
    this.parts = this.laidParts();
    this.rooms.clear();
    if (before === JSON.stringify([this.world.chunkSize, this.parts])) return false;
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

  /** Where floor `level` is indoors (see indoors.ts), out of reach of the sky's light: the scene's own rooms, and each part's. */
  indoors(level: string | undefined): Indoors[] {
    const { levels, gridSize } = this.world;
    return [this.id, ...this.parts.map((p) => p.scene)].flatMap((scene) => {
      const key = `${scene}|${level ?? ''}`;
      if (!this.rooms.has(key)) this.rooms.set(key, indoorsOn(this.mapOf(scene), levels, level, gridSize));
      return this.rooms.get(key) ?? [];
    });
  }

  /** Every light shining on the scene: placed ones in their darkness band, and those tokens carry or their effects give (on the token's level). */
  lights(): LightSource[] {
    const { darkness, levels } = this.world;
    const out: LightSource[] = [];
    for (const c of this.chunks.values()) out.push(...c.lights.filter((l) => lightShines(l, darkness)));
    const carried = [...this.tokens.values()].map((t) => ({ ...t, light: lightOf(t) }));
    return [...out, ...floorLights(carried, levels)];
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

  /** The chunks a map item was in and is in now: one of the scene's own, or of a scene laid on it. */
  chunkKeys(t: Touched, keys: Set<string>): void {
    const [scene, name] = t.coll.split('/');
    const coll = MAP.find((c) => c === name);
    const part = scene === this.id ? undefined : this.parts.find((p) => p.scene === scene);
    if (!coll || (scene !== this.id) === !part) return;
    this.forget(scene!);
    const now = this.docs.get(t.coll, t.id);
    for (const doc of [t.before, now]) {
      if (doc && !isGroup(doc)) keys.add(this.anchor(coll, doc, part));
    }
    if (coll === 'tiles' && reordersTiles(t.before, now)) this.tileKeys(part?.scene, keys);
  }

  /** Every chunk with tiles of the scene itself or of one part: their place in the draw order moved. */
  private tileKeys(part: string | undefined, keys: Set<string>): void {
    for (const [key, chunk] of this.chunks) if (chunk.tiles.some((t) => t.part === part)) keys.add(key);
  }

  /** A scene's map changed: what was worked out from it is worked out again when asked for. */
  private forget(scene: string): void {
    this.laid.delete(scene);
    for (const key of [...this.rooms.keys()]) if (key.startsWith(`${scene}|`)) this.rooms.delete(key);
  }

  private anchor(coll: MapCollection, doc: Doc, part: LaidPart | undefined): string {
    const item = fromDoc<Chunk[typeof coll][number]>(doc);
    return anchorChunk(coll, part ? intoWhole(coll, item, part) : item, this.world.chunkSize);
  }

  refreshChunks(keys: ReadonlySet<string> | undefined, live: boolean): void {
    if (!keys) {
      this.chunks.clear();
      this.rooms.clear();
      this.laid.clear();
    }
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

  /** The scene's map: its own, then each part's laid at its place, drawn over what came before. */
  private map(): Chunk {
    const maps = [this.id, ...this.parts.map((p) => p.scene)].map((scene) => this.mapOf(scene));
    return {
      tiles: maps.flatMap((m) => m.tiles),
      walls: maps.flatMap((m) => m.walls),
      lights: maps.flatMap((m) => m.lights),
    };
  }

  /** The map of the scene itself, or of one of its parts as it lies here. */
  private mapOf(scene: string): Chunk {
    const kept = this.laid.get(scene);
    if (kept) return kept;
    const part = this.parts.find((p) => p.scene === scene);
    const own = ownMap(this.docs, scene);
    const map = part ? partMap(own, part, partZ((this.scene.parts ?? []).findIndex((p) => p.scene === scene))) : own;
    this.laid.set(scene, map);
    return map;
  }
}

/** A part's map as it lies on the whole: moved to its place, its tiles drawn from `z` up. */
function partMap(own: Chunk, part: LaidPart, z: number): Chunk {
  return {
    tiles: own.tiles.map((t) => ({ ...intoWhole('tiles', t, part), z: z + (t.z ?? 0) })),
    walls: own.walls.map((w) => intoWhole('walls', w, part)),
    lights: own.lights.map((l) => intoWhole('lights', l, part)),
  };
}

/** One scene's own map, as its files hold it. */
function ownMap(docs: DocStore, scene: string): Chunk {
  const items = (coll: MapCollection) => docs.all(`${scene}/${coll}`).map((d) => fromDoc(d));
  return {
    tiles: drawnTiles(docs.all(`${scene}/tiles`)),
    walls: items('walls') as Wall[],
    lights: items('lights') as Chunk['lights'],
  };
}

/** True when two scenes' settings differ in nothing but the time of day and the weather (the game's own settings aside). */
export function sameScene(a: World, b: World): boolean {
  const scene = ({ players: _p, name: _n, rules: _r, darkness: _d, weather: _w, ...rest }: World) =>
    JSON.stringify(rest);
  return scene(a) === scene(b);
}

/** Where a scene's sky news goes: the store's events. */
interface SkyEvents {
  emit(event: 'lighting', darkness: number, scene: string): unknown;
  emit(event: 'weather', weather: Weather[], scene: string): unknown;
}

/** Tells what changed of a scene's sky alone (the time of day, the weather), without starting over. */
export function tellSky(to: SkyEvents, old: World, now: World, scene: string): void {
  if (old.darkness !== now.darkness) to.emit('lighting', now.darkness, scene);
  if (JSON.stringify(old.weather) !== JSON.stringify(now.weather)) to.emit('weather', now.weather ?? [], scene);
}

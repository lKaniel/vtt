import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { writeJson } from './json-files.ts';
import { readJsonFile } from './migrate-files.ts';

// Storage v2 moves a world folder (world.json, chunks/, tokens/) to the game
// layout (game.json, scenes/<id>/<collection>.json). The conversion works on
// the raw JSON, so nothing the schemas don't know about is lost and no
// defaults are written into the files. The old files are kept in a backup.

/** What an old world folder holds, as parsed JSON. */
export interface LegacyWorld {
  world?: unknown;
  /** Chunk files by key ("0_-1"). */
  chunks: Record<string, unknown>;
  tokens: unknown[];
}

/** Game files by path relative to the game folder. */
export type GameFiles = Map<string, unknown>;

export interface MigrateOptions {
  gameId?: string;
  sceneId?: string;
  /** Files of a game already in the new layout, to add leftovers to. */
  existing?: GameFiles;
}

type Item = { id: string } & Record<string, unknown>;

const ItemSchema = z.looseObject({ id: z.string().min(1) });
const ChunkFileSchema = z.looseObject({
  tiles: z.array(ItemSchema).default([]),
  walls: z.array(ItemSchema).default([]),
  lights: z.array(ItemSchema).default([]),
});
const WorldFileSchema = z.looseObject({ name: z.string().min(1), players: z.array(z.unknown()) });

const MAP_COLLS = ['tiles', 'walls', 'lights'] as const;
const SCENE_KEYS = ['gridSize', 'chunkSize', 'start', 'darkness', 'vision'];
const NOUN = { tiles: 'tile', walls: 'wall', lights: 'light', tokens: 'token' } as const;

type Coll = keyof typeof NOUN;

function parsed<T>(schema: z.ZodType<T>, data: unknown, file: string): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new Error(`${file} can't be migrated: ${r.error.issues[0]?.message ?? 'invalid'}`);
  return r.data;
}

function slug(text: string): string {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  return words.filter((w) => w.length > 0).join('-');
}

function pick(from: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((k) => k in from).map((k) => [k, from[k]]));
}

/** game.json and scene.json from world.json. */
function splitWorldFile(world: Record<string, unknown> & { name: string }, gameId: string, sceneId: string) {
  const { name, rules, players } = world;
  const game = { id: gameId, name, ...(rules === undefined ? {} : { rules }), scene: sceneId, players };
  return { game, scene: { name, ...pick(world, SCENE_KEYS) } };
}

/** Collects items into one list per collection, renaming ids that are already taken. */
class SceneBuilder {
  readonly lists: Record<Coll, Item[]> = { tiles: [], walls: [], lights: [], tokens: [] };
  readonly notes: string[] = [];
  private taken: Record<Coll, Set<string>> = {
    tiles: new Set(),
    walls: new Set(),
    lights: new Set(),
    tokens: new Set(),
  };

  constructor(existing: (coll: Coll) => unknown) {
    for (const coll of Object.keys(NOUN) as Coll[]) {
      const items = existing(coll);
      if (Array.isArray(items)) for (const item of items as Item[]) this.keep(coll, item);
    }
  }

  add(coll: Coll, item: Item, file: string): void {
    const id = this.free(coll, item.id);
    if (id !== item.id)
      this.notes.push(`${file}: ${NOUN[coll]} "${item.id}" is now "${id}" (ids are unique per scene)`);
    this.keep(coll, { ...item, id });
  }

  private keep(coll: Coll, item: Item): void {
    this.taken[coll].add(item.id);
    this.lists[coll].push(item);
  }

  private free(coll: Coll, id: string): string {
    if (!this.taken[coll].has(id)) return id;
    // "wall-1" goes on as "wall-2", "grass" as "grass-2".
    const m = /^(.*)-(\d+)$/.exec(id);
    const base = m ? m[1]! : id;
    let n = m ? Number(m[2]) + 1 : 2;
    while (this.taken[coll].has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }
}

/** Chunk keys in reading order: row by row, left to right. */
function chunkOrder(keys: string[]): string[] {
  const pos = (k: string) => k.split('_').map(Number) as [number, number];
  return [...keys].sort((a, b) => pos(a)[1] - pos(b)[1] || pos(a)[0] - pos(b)[0]);
}

function addLegacy(builder: SceneBuilder, legacy: LegacyWorld): void {
  for (const key of chunkOrder(Object.keys(legacy.chunks))) {
    const file = `chunks/${key}.json`;
    const chunk = parsed(ChunkFileSchema, legacy.chunks[key], file);
    for (const coll of MAP_COLLS) for (const item of chunk[coll]) builder.add(coll, item, file);
  }
  for (const raw of legacy.tokens) {
    const token = parsed(ItemSchema, raw, 'a token file');
    builder.add('tokens', token, `tokens/${token.id}.json`);
  }
}

/** The files to write for the new layout, and notes on anything that had to change. */
export function migrateWorld(legacy: LegacyWorld, opts: MigrateOptions = {}): { files: GameFiles; notes: string[] } {
  const files: GameFiles = new Map();
  const current = opts.existing?.get('game.json') as { scene?: string } | undefined;
  let sceneId = current?.scene;
  if (!sceneId) {
    const world = parsed(WorldFileSchema, legacy.world, 'world.json');
    sceneId = opts.sceneId ?? 'main';
    const { game, scene } = splitWorldFile(world, opts.gameId ?? (slug(world.name) || 'game'), sceneId);
    files.set('game.json', game);
    files.set(`scenes/${sceneId}/scene.json`, scene);
  }
  const dir = `scenes/${sceneId}`;
  const builder = new SceneBuilder((coll) => opts.existing?.get(`${dir}/${coll}.json`));
  addLegacy(builder, legacy);
  for (const coll of Object.keys(NOUN) as Coll[]) files.set(`${dir}/${coll}.json`, builder.lists[coll]);
  return { files, notes: builder.notes };
}

// On disk

const LEGACY = ['world.json', 'chunks', 'tokens'];
/** Kept in place (the new layout has them too), but copied into the backup. */
const SHARED = ['actors', 'combat.json', 'game.json', 'scenes'];

async function readFolder(dir: string, sub: string): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  const names = await readdir(join(dir, sub)).catch(() => [] as string[]);
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    out.set(name.slice(0, -'.json'.length), await readJsonFile(dir, `${sub}/${name}`));
  }
  return out;
}

async function readLegacy(dir: string, names: string[]): Promise<LegacyWorld> {
  const world = names.includes('world.json') ? await readJsonFile(dir, 'world.json') : undefined;
  const chunks = Object.fromEntries(await readFolder(dir, 'chunks'));
  const tokens = [...(await readFolder(dir, 'tokens')).values()];
  return { world, chunks, tokens };
}

/** game.json and the active scene's collections, when the folder is already in the new layout. */
async function readExisting(dir: string, names: string[]): Promise<GameFiles | undefined> {
  if (!names.includes('game.json')) return undefined;
  const game = (await readJsonFile(dir, 'game.json')) as { scene?: string };
  const existing: GameFiles = new Map([['game.json', game]]);
  for (const coll of Object.keys(NOUN)) {
    const rel = `scenes/${game.scene}/${coll}.json`;
    const data = await readJsonFile(dir, rel).catch(() => undefined);
    if (data !== undefined) existing.set(rel, data);
  }
  return existing;
}

export interface Migrated {
  /** The backup folder, relative to the game folder. */
  backup: string;
  notes: string[];
}

/**
 * Moves a world folder in the old layout to the new one, in place. Returns
 * null when there is nothing to migrate. Old files left next to a migrated
 * game are added to its scene. Every old file is copied to
 * `.v1-backup/<time>/` first, and a broken one stops the move before
 * anything changes. game.json is written last, so a move cut short is
 * simply redone on the next start.
 */
export async function migrateFolder(
  dir: string,
  { now = new Date(), ...opts }: Omit<MigrateOptions, 'existing'> & { now?: Date } = {},
): Promise<Migrated | null> {
  const names = await readdir(dir);
  if (!LEGACY.some((n) => names.includes(n))) return null;
  const existing = await readExisting(dir, names);
  const { files, notes } = migrateWorld(await readLegacy(dir, names), { ...opts, existing });
  const backup = `.v1-backup/${now
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(':', '-')}`;
  await mkdir(join(dir, backup), { recursive: true });
  for (const name of [...LEGACY, ...SHARED].filter((n) => names.includes(n))) {
    await cp(join(dir, name), join(dir, backup, name), { recursive: true });
  }
  for (const [rel, data] of files) if (rel !== 'game.json') await writeJson(join(dir, rel), data);
  for (const name of LEGACY) await rm(join(dir, name), { recursive: true, force: true });
  if (files.has('game.json')) await writeJson(join(dir, 'game.json'), files.get('game.json'));
  return { backup, notes };
}

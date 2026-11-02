import { basename, join } from 'node:path';
import { defaultEdition } from '@vtt/core';
import { DEFAULT_SYSTEM, type FoundryImportReport, type Game, type Player, type SceneEntry } from '@vtt/shared';
import { z } from 'zod';
import {
  type ActorSystem,
  foundryActors,
  folderNames,
  foundryTokens,
  idMaker,
  plural,
  type PlacedActor,
} from './foundry-actors.ts';
import { type FoundryDoc, readFoundryDb } from './foundry-db.ts';
import { type ConvertedEntries, foundryEntries } from './foundry-entries.ts';
import { dataFolderOf, FoundryMedia } from './foundry-media.ts';
import { foundryGrid, foundryScene, type MediaLookup } from './foundry-scene.ts';
import { readJson, writeJson } from './json-files.ts';
import { FORMAT } from './migrate-ownership.ts';
import { SYSTEMS } from './systems.ts';

// A whole Foundry VTT world as a new game: every scene with its walls,
// lights, tiles, tokens and the rest, the actors (sheets read by the game
// system, see SystemDefinition.foundry), journal entries, roll tables and
// playlists in their folders, and every picture and sound they use, copied
// into the game's assets/foundry/. It reads the world's databases directly
// (NeDB files up to v10, LevelDB from v11), so Foundry need not run, and
// never changes them. The asset-pack import (foundry-import.ts) is for
// modules whose maps and handouts a GM wants to pick from.

const WorldSchema = z.object({
  /** `id` since v10, `name` before. */
  id: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  system: z.string().optional(),
});

export interface WorldImportOptions {
  /** The importing account's seat: the game's GM. */
  gm: Player;
  /** Foundry's Data folder, where files outside the world are; found from the world's place by default. */
  dataDir?: string;
  /** The game's name; the world's title by default. */
  name?: string;
}

export type WorldReport = FoundryImportReport;

const COLLECTIONS = [
  'scenes',
  'actors',
  'items',
  'journal',
  'tables',
  'playlists',
  'folders',
  'settings',
  'users',
  'macros',
  'cards',
] as const;
type Docs = Record<(typeof COLLECTIONS)[number], FoundryDoc[]>;

interface World {
  dir: string;
  id: string;
  title: string;
  /** The Foundry system it is for, e.g. "dnd5e". */
  system: string;
  docs: Docs;
}

async function readManifest(dir: string) {
  const raw = await readJson(join(dir, 'world.json'));
  if (raw === undefined) throw new Error(`${dir} has no world.json: pick a world's folder in Foundry's Data/worlds/.`);
  const m = WorldSchema.parse(raw);
  const id = m.id ?? m.name ?? 'world';
  return { ...m, id, title: m.title ?? id };
}

/** A Foundry world's title, to name the game after. */
export const foundryWorldTitle = async (dir: string): Promise<string> => (await readManifest(dir)).title;

/** The world's manifest and every database we read. */
async function readWorld(dir: string): Promise<World> {
  const m = await readManifest(dir);
  const id = m.id;
  const docs = {} as Docs;
  for (const c of COLLECTIONS) docs[c] = await readFoundryDb(join(dir, 'data', c));
  return { dir, id, title: m.title, system: m.system ?? '', docs };
}

/** A world setting by key (Foundry keeps each value as JSON text). */
function settingsOf(settings: FoundryDoc[]) {
  return (key: string): unknown => {
    const value = settings.find((s) => s.key === key)?.value;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  };
}

/** The system that reads this world's actors, else the server's default (bare actors). */
function systemFor(world: World): ActorSystem {
  const all = [...SYSTEMS.infos()].map((s) => SYSTEMS.get(s.id)!);
  return all.find((s) => s.foundry?.system === world.system) ?? SYSTEMS.require(DEFAULT_SYSTEM);
}

interface SceneContext {
  media: MediaLookup;
  entries: ConvertedEntries;
  actors: Map<string, PlacedActor>;
  system: ActorSystem;
}

interface ConvertedScene {
  id: string;
  entry: SceneEntry;
  tokens: Record<string, unknown>[];
  playlist?: string;
  active: boolean;
}

const bySort = (a: FoundryDoc, b: FoundryDoc) =>
  (typeof a.sort === 'number' ? a.sort : 0) - (typeof b.sort === 'number' ? b.sort : 0);

function convertScenes(raw: FoundryDoc[], ctx: SceneContext, skipped: string[]): ConvertedScene[] {
  const nextId = idMaker('scene');
  return [...raw].sort(bySort).map((data) => {
    const { scene, skipped: lost } = foundryScene(data, ctx.media, { ...ctx.entries, keepsTokens: true });
    const id = nextId(scene.name);
    const tokens = foundryTokens(data.tokens, {
      grid: foundryGrid(data).size,
      actors: ctx.actors,
      sheets: ctx.system.foundry,
      media: ctx.media,
    });
    skipped.push(...[...lost, ...tokens.skipped].map((what) => `scene "${scene.name}": ${what}`));
    const playlist = typeof data.playlist === 'string' ? ctx.entries.playlistIds(data.playlist) : undefined;
    return { id, entry: { id, ...scene }, tokens: tokens.tokens, playlist, active: data.active === true };
  });
}

const PARTS = ['tiles', 'walls', 'lights', 'drawings', 'notes', 'templates', 'regions', 'sounds'] as const;

async function writeScene(game: string, s: ConvertedScene): Promise<void> {
  const dir = join(game, 'scenes', s.id);
  const { id: _id, ...entry } = s.entry;
  const settings = Object.fromEntries(Object.entries(entry).filter(([k]) => !(PARTS as readonly string[]).includes(k)));
  if (s.playlist) settings.playlist = s.playlist;
  for (const part of PARTS) if (entry[part].length) await writeJson(join(dir, `${part}.json`), entry[part]);
  if (s.tokens.length) await writeJson(join(dir, 'tokens.json'), s.tokens);
  await writeJson(join(dir, 'scene.json'), settings);
}

async function writeEach(dir: string, docs: { id: string }[]): Promise<void> {
  for (const doc of docs) await writeJson(join(dir, `${doc.id}.json`), doc);
}

const names = (docs: FoundryDoc[]) => {
  const list = docs.map((d) => (typeof d.name === 'string' ? d.name : '?'));
  return list.length > 5 ? `${list.slice(0, 5).join(', ')}, ...` : list.join(', ');
};

/** What the world has that has no place in a game here. */
function leftBehind(world: World, system: ActorSystem): string[] {
  const { items, users, macros, cards } = world.docs;
  const players = users.filter((u) => typeof u.role !== 'number' || u.role < 4);
  return [
    ...(system.foundry?.system === world.system
      ? []
      : [
          `sheets: the world is for the Foundry "${world.system}" system, which we can't read, so actors keep only their name and picture`,
        ]),
    ...(items.length
      ? [
          `${plural(items.length, 'item')} in the Items sidebar (${names(items)}): drag items from the Compendium instead`,
        ]
      : []),
    ...(players.length
      ? [
          `Foundry users (${names(players)}): invite your players with the game's invite link; their characters are actors to give them`,
        ]
      : []),
    ...(macros.length ? [`${plural(macros.length, 'macro')}: scripts are Foundry's own`] : []),
    ...(cards.length ? [`${plural(cards.length, 'card stack')}: we have no cards yet`] : []),
  ];
}

/** Imports the Foundry world folder `from` as a new game in the folder `game` (its name is the game's id). */
export async function importFoundryWorld(from: string, game: string, opts: WorldImportOptions): Promise<WorldReport> {
  const world = await readWorld(from);
  const system = systemFor(world);
  const rules = system.foundry?.rules(settingsOf(world.docs.settings)) ?? defaultEdition(system);
  const media = new FoundryMedia({ dir: from, id: world.id }, opts.dataDir ?? dataFolderOf(from));
  const folderOf = folderNames(world.docs.folders);
  const { docs } = world;
  const entries = foundryEntries(
    { journals: docs.journal, tables: docs.tables, playlists: docs.playlists },
    media.lookup,
    folderOf,
  );
  const actors = foundryActors(docs.actors, { system, sheets: system.foundry, rules, media: media.lookup, folderOf });
  const skipped = [...entries.skipped, ...actors.skipped];
  const scenes = convertScenes(
    docs.scenes,
    { media: media.lookup, entries, actors: actors.byFoundryId, system },
    skipped,
  );
  skipped.push(...leftBehind(world, system));
  for (const s of scenes) await writeScene(game, s);
  await writeEach(join(game, 'actors'), actors.actors as { id: string }[]);
  await writeEach(join(game, 'journals'), entries.journals);
  await writeEach(join(game, 'tables'), entries.tables);
  await writeEach(join(game, 'playlists'), entries.playlists);
  const name = opts.name?.trim() ? opts.name.trim() : world.title;
  const active = scenes.find((s) => s.active) ?? scenes[0];
  if (!active) await writeJson(join(game, 'scenes/main/scene.json'), { name: 'Main', darkness: 0 });
  const file: Game = {
    id: basename(game),
    name,
    system: system.id,
    rules,
    format: FORMAT,
    scene: active?.id ?? 'main',
    players: [opts.gm],
  };
  await writeJson(join(game, 'game.json'), file);
  return {
    name,
    scenes: scenes.length,
    actors: actors.actors.length,
    tokens: scenes.reduce((n, s) => n + s.tokens.length, 0),
    journals: entries.journals.length,
    tables: entries.tables.length,
    playlists: entries.playlists.length,
    media: await media.copyTo(game),
    skipped,
  };
}

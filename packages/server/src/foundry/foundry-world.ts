import { basename, join } from 'node:path';
import { defaultEdition } from '@vtt/core';
import type { FoundryImportReport, Game, Player } from '@vtt/shared';
import { dataFolderOf, FoundryMedia } from './foundry-media.ts';
import { readWorld, settingsOf, systemFor } from './foundry-world-read.ts';
import { LossLog } from './import-losses.ts';
import { type SceneOut, WORLD_PARTS, type WorldContext, type WorldOut } from './world-parts.ts';
import { writeJson } from '../store/json-files.ts';
import { FORMAT } from '../migrate/migrate-folders.ts';

// A whole Foundry VTT world as a new game: every scene with its walls,
// lights, tiles, tokens and the rest, the actors (sheets read by the game
// system, see SystemDefinition.foundry), journal entries, roll tables and
// playlists in their folders, and every picture and sound they use, copied
// into the game's assets/foundry/. It reads the world's databases directly
// (NeDB files up to v10, LevelDB from v11), so Foundry need not run, and
// never changes them. What it brings is a list of parts (world-parts.ts).
// The asset-pack import (foundry-import.ts) is for modules whose maps and
// handouts a GM wants to pick from.

export { foundryWorldTitle } from './foundry-world-read.ts';

export interface WorldImportOptions {
  /** The importing account's seat: the game's GM. */
  gm: Player;
  /** Foundry's Data folder, where files outside the world are; found from the world's place by default. */
  dataDir?: string;
  /** The game's name; the world's title by default. */
  name?: string;
}

export type WorldReport = FoundryImportReport;

const PARTS = ['tiles', 'walls', 'lights', 'drawings', 'notes', 'templates', 'regions', 'sounds'] as const;

async function writeScene(game: string, s: SceneOut): Promise<void> {
  const dir = join(game, 'scenes', s.id);
  const { id: _id, ...entry } = s.entry;
  const settings = Object.fromEntries(Object.entries(entry).filter(([k]) => !(PARTS as readonly string[]).includes(k)));
  if (s.playlist) settings.playlist = s.playlist;
  if (s.folder) settings.folder = s.folder;
  for (const part of PARTS) if (entry[part].length) await writeJson(join(dir, `${part}.json`), entry[part]);
  if (s.tokens.length) await writeJson(join(dir, 'tokens.json'), s.tokens);
  await writeJson(join(dir, 'scene.json'), settings);
}

/** Writes what the parts made into the folder `game`. */
async function writeGame(game: string, out: WorldOut): Promise<void> {
  for (const s of out.scenes) await writeScene(game, s);
  if (!out.scenes.length) await writeJson(join(game, 'scenes/main/scene.json'), { name: 'Main', darkness: 0 });
  for (const [collection, docs] of Object.entries(out.docs))
    for (const doc of docs) await writeJson(join(game, collection, `${doc.id}.json`), doc);
  for (const [path, value] of Object.entries(out.files)) await writeJson(join(game, path), value);
}

const count = (out: WorldOut, collection: string) => out.docs[collection]?.length ?? 0;

/** Imports the Foundry world folder `from` as a new game in the folder `game` (its name is the game's id). */
export async function importFoundryWorld(from: string, game: string, opts: WorldImportOptions): Promise<WorldReport> {
  const world = await readWorld(from);
  const system = systemFor(world);
  const setting = settingsOf(world.docs.settings);
  const rules = system.foundry?.rules(setting) ?? defaultEdition(system);
  const media = new FoundryMedia({ dir: from, id: world.id }, opts.dataDir ?? dataFolderOf(from));
  const log = new LossLog();
  const ctx: WorldContext = { world, system, rules, setting, media, log, made: { folderOf: () => undefined } };
  const out: WorldOut = { docs: {}, scenes: [], files: {}, game: { players: [opts.gm] } };
  for (const part of WORLD_PARTS) part.run(ctx, out);
  const name = opts.name?.trim() ? opts.name.trim() : world.title;
  await writeGame(game, out);
  const file: Game = {
    id: basename(game),
    name,
    system: system.id,
    rules,
    format: FORMAT,
    scene: 'main',
    players: [opts.gm],
    ...out.game,
  };
  await writeJson(join(game, 'game.json'), file);
  return {
    name,
    scenes: out.scenes.length,
    actors: count(out, 'actors'),
    tokens: out.scenes.reduce((n, s) => n + s.tokens.length, 0),
    journals: count(out, 'journals'),
    tables: count(out, 'tables'),
    playlists: count(out, 'playlists'),
    macros: count(out, 'macros'),
    media: await media.copyTo(game),
    left: log.list(),
  };
}

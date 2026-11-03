import type { Game, SceneEntry } from '@vtt/shared';
import { type ActorSystem, type ConvertedActors, foundryActors, foundryTokens, idMaker } from './foundry-actors.ts';
import type { FoundryDoc } from './foundry-db.ts';
import { type ConvertedEntries, type FolderLookup, foundryEntries } from './foundry-entries.ts';
import { foundryFolders } from './foundry-folders.ts';
import { foundryFloors } from './foundry-levels.ts';
import { foundryMacros } from './foundry-macros.ts';
import type { FoundryMedia } from './foundry-media.ts';
import { foundryGrid, foundryScene } from './foundry-scene.ts';
import { foundryClock } from './foundry-time.ts';
import { tokenModelOf } from './foundry-3d.ts';
import { lost, type LossLog, placed } from './import-losses.ts';
import type { World } from './foundry-world-read.ts';

// The parts of a world import, run in order. Each reads the Foundry world
// and what earlier parts made (`ctx.made`: our ids for Foundry's folders,
// entries and actors), and adds files to the game (`out`). Something new
// to bring along (a Foundry collection, a module's flags) is a new part,
// placed after the parts it points at.

/** What earlier parts made, for later ones to point at. */
export interface Made {
  folderOf: FolderLookup;
  entries?: ConvertedEntries;
  actors?: ConvertedActors;
}

export interface WorldContext {
  world: World;
  system: ActorSystem;
  rules: string;
  /** A world setting by key. */
  setting: (key: string) => unknown;
  media: FoundryMedia;
  log: LossLog;
  made: Made;
}

export interface SceneOut {
  id: string;
  folder?: string;
  entry: SceneEntry;
  tokens: Record<string, unknown>[];
  playlist?: string;
  active: boolean;
}

/** The game the parts make: documents by collection folder, scenes, other files and game.json fields. */
export interface WorldOut {
  docs: Record<string, { id: string }[]>;
  scenes: SceneOut[];
  /** Other files by their path in the game folder. */
  files: Record<string, unknown>;
  game: Partial<Game>;
}

export interface WorldPart {
  id: string;
  run: (ctx: WorldContext, out: WorldOut) => void;
}

const add = (out: WorldOut, collection: string, docs: readonly object[]) => {
  out.docs[collection] = [...(out.docs[collection] ?? []), ...(docs as { id: string }[])];
};

const folders: WorldPart = {
  id: 'folders',
  run: (ctx, out) => {
    const f = foundryFolders(ctx.world.docs.folders);
    ctx.made.folderOf = f.folderOf;
    add(out, 'folders', f.folders);
  },
};

const entries: WorldPart = {
  id: 'entries',
  run: (ctx, out) => {
    const { journal, tables, playlists } = ctx.world.docs;
    const e = foundryEntries({ journals: journal, tables, playlists }, ctx.media.lookup, ctx.made.folderOf);
    ctx.made.entries = e;
    ctx.log.add(e.skipped);
    add(out, 'journals', e.journals);
    add(out, 'tables', e.tables);
    add(out, 'playlists', e.playlists);
  },
};

const macros: WorldPart = {
  id: 'macros',
  run: (ctx, out) => {
    const m = foundryMacros(ctx.world.docs.macros, ctx.media.lookup, ctx.made.folderOf);
    ctx.log.add(m.skipped);
    add(out, 'macros', m.macros);
  },
};

const actors: WorldPart = {
  id: 'actors',
  run: (ctx, out) => {
    const { system, rules } = ctx;
    const media = ctx.media.lookup;
    const a = foundryActors(ctx.world.docs.actors, {
      system,
      sheets: system.foundry,
      rules,
      media,
      folderOf: ctx.made.folderOf,
    });
    ctx.made.actors = a;
    ctx.log.add(a.skipped);
    add(out, 'actors', a.actors);
  },
};

const bySort = (a: FoundryDoc, b: FoundryDoc) =>
  (typeof a.sort === 'number' ? a.sort : 0) - (typeof b.sort === 'number' ? b.sort : 0);

/** A token's elevation in feet: on the floor v14 says it is on, else its own. */
function tokenElevation(scene: FoundryDoc, distance: number): (t: FoundryDoc) => number {
  const feet = (units: number) => Math.round((units * 5) / distance);
  const floors = foundryFloors(scene, feet);
  return (t) => floors?.elevationOf(t) ?? (typeof t.elevation === 'number' ? feet(t.elevation) : 0);
}

function sceneOf(data: FoundryDoc, id: (name: string) => string, ctx: WorldContext): SceneOut {
  const lookups = { ...ctx.made.entries!, keepsTokens: true };
  const { scene, skipped } = foundryScene(data, ctx.media.lookup, lookups);
  const grid = foundryGrid(data);
  const tokens = foundryTokens(data.tokens, {
    grid: grid.size,
    actors: ctx.made.actors!.byFoundryId,
    sheets: ctx.system.foundry,
    media: ctx.media.lookup,
    elevation: tokenElevation(data, grid.distance),
    model: (t) => tokenModelOf(t, ctx.media.lookup),
  });
  ctx.log.add(placed(scene.name, [...skipped, ...tokens.skipped]));
  const sceneId = id(scene.name);
  const playlist = typeof data.playlist === 'string' ? ctx.made.entries!.playlistIds(data.playlist) : undefined;
  const folder = ctx.made.folderOf(typeof data.folder === 'string' ? data.folder : undefined);
  return {
    id: sceneId,
    folder,
    entry: { id: sceneId, ...scene },
    tokens: tokens.tokens,
    playlist,
    active: data.active === true,
  };
}

const scenes: WorldPart = {
  id: 'scenes',
  run: (ctx, out) => {
    const nextId = idMaker('scene');
    out.scenes.push(...[...ctx.world.docs.scenes].sort(bySort).map((s) => sceneOf(s, nextId, ctx)));
    const active = out.scenes.find((s) => s.active) ?? out.scenes[0];
    if (active) out.game.scene = active.id;
  },
};

const time: WorldPart = {
  id: 'time',
  run: (ctx, out) => {
    const clock = foundryClock(ctx.setting);
    if (clock) out.files['time.json'] = clock;
  },
};

const names = (docs: FoundryDoc[]) => docs.map((d) => (typeof d.name === 'string' ? d.name : '?'));

/** What the world has that has no place in a game here (yet). */
const leftBehind: WorldPart = {
  id: 'left-behind',
  run: (ctx) => {
    const { world, system } = ctx;
    const { items, users, cards } = world.docs;
    const players = users.filter((u) => typeof u.role !== 'number' || u.role < 4);
    const losses = [
      ...(system.foundry?.system === world.system
        ? []
        : [
            lost(
              `Sheets of the Foundry "${world.system}" system, which we can't read (actors keep their name and picture)`,
              1,
            ),
          ]),
      ...(items.length
        ? [lost('Items in the Items sidebar (drag items from the Compendium instead)', items.length, names(items))]
        : []),
      ...(players.length
        ? [lost("Foundry users (add your players on the game's page)", players.length, names(players))]
        : []),
      ...(cards.length ? [lost('Card stacks', cards.length, names(cards))] : []),
    ];
    ctx.log.add(losses);
  },
};

/** Every part, in the order they run. */
export const WORLD_PARTS: readonly WorldPart[] = [folders, entries, macros, actors, scenes, time, leftBehind];

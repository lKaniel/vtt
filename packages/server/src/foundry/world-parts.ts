import type { Game, Player, SceneEntry, Tile } from '@vtt/shared';
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
import { foundryOwnership, foundryPlayers, type OwnershipOf } from './foundry-users.ts';
import { foundryTrigger, SceneIndex } from './foundry-active-tiles.ts';
import { looseActors, type PropContext, propsOf, splitTokens } from './foundry-props.ts';
import { originOf } from './foundry-origin.ts';
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
  /** Foundry's levels as ours, for the game's players. */
  ownership?: OwnershipOf;
  entries?: ConvertedEntries;
  actors?: ConvertedActors;
  /** Our scene id by Foundry scene id. */
  scenes: Map<string, string>;
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
  /** The importing seat: the game's GM, standing in for Foundry's first gamemaster. */
  gm: Player;
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

const names = (docs: FoundryDoc[]) => docs.map((d) => (typeof d.name === 'string' ? d.name : '?'));

const PASSWORDS = "Players' passwords (Foundry keeps only their hashes: give them new ones on the game's page)";

/** Foundry's users as the game's players, the importing GM first. */
const players: WorldPart = {
  id: 'players',
  run: (ctx, out) => {
    const { users } = ctx.world.docs;
    const p = foundryPlayers(users, ctx.gm, ctx.media.lookup);
    ctx.made.ownership = p.ownership;
    out.game.players = p.players;
    const locked = users.filter((u) => typeof u.password === 'string' && u.password);
    if (locked.length) ctx.log.add([lost(PASSWORDS, locked.length, names(locked))]);
  },
};

const entries: WorldPart = {
  id: 'entries',
  run: (ctx, out) => {
    const { journal, tables, playlists } = ctx.world.docs;
    const raw = { journals: journal, tables, playlists };
    const e = foundryEntries(raw, ctx.media.lookup, ctx.made.folderOf, ctx.made.ownership);
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
    const known = new Set(ctx.world.docs.actors.map((x) => x._id));
    const loose = looseActors(ctx.world.docs.scenes, (t) => known.has(t.actorId));
    const a = foundryActors([...ctx.world.docs.actors, ...loose], {
      system,
      sheets: system.foundry,
      rules,
      media,
      folderOf: ctx.made.folderOf,
      ownership: ctx.made.ownership,
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

function floorsOf(scene: FoundryDoc, distance: number) {
  const feet = (units: number) => Math.round((units * 5) / distance);
  return { feet, floors: foundryFloors(scene, feet) };
}

/** Scenery placed as tokens, as tiles and lights after the scene's own (numbered on). */
function addProps(scene: Omit<SceneEntry, 'id'>, props: FoundryDoc[], c: PropContext): void {
  const { tiles, lights } = propsOf(props, c);
  const firstTile = scene.tiles.length;
  const firstLight = scene.lights.length;
  scene.tiles.push(...tiles.map((t, i) => ({ ...t, id: `tile-${firstTile + i + 1}` }) as Tile));
  scene.lights.push(...lights.map((l, i) => ({ ...l, id: `light-${firstLight + i + 1}` })));
}

function sceneOf(data: FoundryDoc, id: (name: string) => string, ctx: WorldContext): SceneOut {
  const lookups = { ...ctx.made.entries!, keepsTokens: true, keepsTriggers: true };
  const { scene, skipped } = foundryScene(data, ctx.media.lookup, lookups);
  const grid = foundryGrid(data);
  const split = splitTokens(data.tokens, (t) => ctx.made.actors!.byFoundryId.has(String(t.actorId)));
  addProps(scene, split.props, { grid: grid.size, media: ctx.media.lookup, ...floorsOf(data, grid.distance) });
  const tokens = foundryTokens(split.creatures, {
    grid: grid.size,
    actors: ctx.made.actors!.byFoundryId,
    sheets: ctx.system.foundry,
    media: ctx.media.lookup,
    elevation: tokenElevation(data, grid.distance),
    model: (t) => tokenModelOf(t, ctx.media.lookup),
  });
  ctx.log.add(placed(scene.name, [...skipped, ...tokens.skipped]));
  const sceneId = id(scene.name);
  if (typeof data._id === 'string') ctx.made.scenes.set(data._id, sceneId);
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

const MONKS_LOST = "Monk's Active Tiles actions we have no match for";
const MONKS_TILES = "Monk's Active Tiles triggers that do nothing we can do (the tile comes without it)";

/** Every placeable of a converted scene, to find by Foundry id or Tagger tag. */
function indexOf(s: SceneOut): SceneIndex {
  const e = s.entry;
  return new SceneIndex()
    .add('tiles', e.tiles)
    .add('walls', e.walls)
    .add('lights', e.lights)
    .add('sounds', e.sounds)
    .add('regions', e.regions)
    .add('drawings', e.drawings)
    .add('notes', e.notes)
    .add('tokens', s.tokens as { id: string }[]);
}

/** The pictures Monk's Active Tiles cycles a tile through (its `files`, patterns spelled out). */
function monksImages(index: SceneIndex, media: WorldContext['media']) {
  return (tile: string): string[] => {
    const flags = index.rawOf({ coll: 'tiles', id: tile })?.flags as Record<string, { files?: unknown }> | undefined;
    const files = flags?.['monks-active-tiles']?.files;
    const names = (Array.isArray(files) ? files : [])
      .map((f) => (f as { name?: unknown }).name)
      .filter((n) => typeof n === 'string');
    return names.flatMap((n) => (n.includes('*') ? media.glob(n) : (media.lookup(n) ?? [])));
  };
}

function monksTiles(s: SceneOut, ctx: WorldContext): void {
  const index = indexOf(s);
  const media = ctx.media;
  const lookups = {
    index,
    media: media.lookup,
    glob: (p: string) => media.glob(p),
    scene: (id: string) => ctx.made.scenes.get(id),
    imagesOf: monksImages(index, media),
  };
  const missing: string[] = [];
  let idle = 0;
  for (const tile of s.entry.tiles) {
    const raw = originOf(tile);
    if (!raw) continue;
    const converted = foundryTrigger(raw, tile.id, lookups);
    missing.push(...converted.lost);
    if (converted.trigger && tile.kind !== 'group') (tile as { trigger?: unknown }).trigger = converted.trigger;
    else if (converted.lost.length) idle++;
  }
  const losses = [
    ...(missing.length ? [lost(MONKS_LOST, missing.length, [...new Set(missing)])] : []),
    ...(idle ? [lost(MONKS_TILES, idle)] : []),
  ];
  ctx.log.add(placed(s.entry.name, losses));
}

/** Monk's Active Tiles as tile triggers, once every scene (and its id) is known. */
const activeTiles: WorldPart = {
  id: 'active-tiles',
  run: (ctx, out) => {
    for (const s of out.scenes) monksTiles(s, ctx);
  },
};

const time: WorldPart = {
  id: 'time',
  run: (ctx, out) => {
    const clock = foundryClock(ctx.setting);
    if (clock) out.files['time.json'] = clock;
  },
};

/** The Items sidebar: the world's own spells and gear become the game's homebrew (the system says how). */
const homebrew: WorldPart = {
  id: 'homebrew',
  run: (ctx, out) => {
    const { items } = ctx.world.docs;
    const convert = ctx.system.foundry?.system === ctx.world.system ? ctx.system.foundry.homebrew : undefined;
    const ownership = ctx.made.ownership ?? foundryOwnership();
    const nextId = idMaker('item');
    const kept: string[] = [];
    const docs = items.flatMap((item) => {
      const name = typeof item.name === 'string' ? item.name : 'Item';
      const doc = convert?.(item, nextId(name), ctx.rules);
      if (!doc) return [];
      kept.push(String(item._id));
      const owned = ownership(item.ownership, 'none');
      return [{ ...doc, ...(owned ? { ownership: owned } : {}) }];
    });
    add(out, 'homebrew', docs);
    const rest = items.filter((i) => !kept.includes(String(i._id)));
    const what = 'Items in the Items sidebar the Compendium already has, or that only live on sheets';
    if (rest.length) ctx.log.add([lost(what, rest.length, names(rest))]);
  },
};

/** What the world has that has no place in a game here (yet). */
const leftBehind: WorldPart = {
  id: 'left-behind',
  run: (ctx) => {
    const { world, system } = ctx;
    const { cards } = world.docs;
    const losses = [
      ...(system.foundry?.system === world.system
        ? []
        : [
            lost(
              `Sheets of the Foundry "${world.system}" system, which we can't read (actors keep their name and picture)`,
              1,
            ),
          ]),
      ...(cards.length ? [lost('Card stacks', cards.length, names(cards))] : []),
    ];
    ctx.log.add(losses);
  },
};

/** Every part, in the order they run. */
export const WORLD_PARTS: readonly WorldPart[] = [
  folders,
  players,
  entries,
  macros,
  actors,
  scenes,
  activeTiles,
  time,
  homebrew,
  leftBehind,
];

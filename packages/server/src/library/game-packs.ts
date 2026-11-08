import {
  type ArtIndex,
  enabledPacks,
  mergeArt,
  type PackCompendium,
  type PackInfo,
  type SystemDefinition,
} from '@vtt/core';
import {
  type Content,
  contentWith,
  editionOf,
  gameCompendia,
  type Token,
  withOwn,
  withSettings,
} from '@vtt/system-dnd5e';
import { fromDoc } from '../store/doc-sync.ts';
import type { GameStore } from '../store/game-store.ts';
import type { PackStore } from './pack-store.ts';

// Which packs a game uses: its system's own (always on), the installed
// packs game.json `packs` turns on and those on in every game (`everyGame`),
// if they fit its system. Their monster,
// item and spell compendia (whatever the system calls rules content) add to
// what the game's tokens can refer to.

/** What of game.json the packs depend on. */
interface GamePacks {
  system: string;
  packs?: readonly string[];
}

type System = Pick<SystemDefinition, 'id' | 'packs' | 'contentTypes'>;

/** The packs a game uses: those game.json names, then those on in every game. */
function packIds(store: PackStore | undefined, game: GamePacks): string[] {
  const named = game.packs ?? [];
  const always = (store?.list() ?? []).filter((p) => p.everyGame && !named.includes(p.id)).map((p) => p.id);
  return [...named, ...always];
}

/** The system's packs, then every installed pack for its system or for none, with whether the game uses it. */
export function packInfos(store: PackStore | undefined, game: GamePacks, system: System): PackInfo[] {
  const on = new Set(packIds(store, game));
  const builtin = (system.packs ?? []).map((p): PackInfo => ({ ...p.manifest, builtin: true, enabled: true }));
  const installed = (store?.list() ?? [])
    .filter((p) => p.system === null || p.system === system.id)
    .map((p): PackInfo => ({ ...p, enabled: on.has(p.id) }));
  return [...builtin, ...installed];
}

interface Cached {
  revision: number;
  lists: Map<string, PackCompendium[]>;
  art: Map<string, ArtIndex>;
}
const cache = new WeakMap<PackStore, Cached>();

/** What is cached of a store, emptied when its packs were read again. */
function cachedOf(store: PackStore): Cached {
  let known = cache.get(store);
  if (known?.revision !== store.revision) {
    known = { revision: store.revision, lists: new Map(), art: new Map() };
    cache.set(store, known);
  }
  return known;
}

/**
 * The rules-content compendia of the packs a game turned on. The same list
 * comes back while the packs and the game's choice stay the same, so the
 * system can cache what it builds from it.
 */
export function contentCompendia(store: PackStore | undefined, game: GamePacks, system: System): PackCompendium[] {
  const ids = packIds(store, game);
  if (!store || !ids.length || !system.contentTypes?.length) return [];
  const key = `${system.id}|${ids.join(',')}`;
  const known = cachedOf(store).lists;
  const hit = known.get(key);
  if (hit) return hit;
  const types = new Set(system.contentTypes);
  const list = enabledPacks(store.list(), ids, system.id).flatMap((p) =>
    store.compendia(p.id).filter((c) => types.has(c.type)),
  );
  known.set(key, list);
  return list;
}

/**
 * The pictures and animations the packs a game turned on offer its content:
 * each pack's art file, then what the system matches in its media by name,
 * a pack listed earlier in game.json winning (see core/pack-art.ts). The
 * same object while the packs and the game's choice stay the same.
 */
export function gameArt(
  store: PackStore | undefined,
  game: GamePacks,
  system: Pick<SystemDefinition, 'id' | 'packArt'>,
): ArtIndex {
  const ids = packIds(store, game);
  if (!store || !ids.length) return {};
  const key = `${system.id}|${ids.join(',')}`;
  const known = cachedOf(store).art;
  const hit = known.get(key);
  if (hit) return hit;
  const matched = (id: string) => system.packArt?.(store.listedMedia(id)) ?? {};
  const packs = enabledPacks(store.list(), ids, system.id);
  const ordered = ids.flatMap((id) => packs.filter((p) => p.id === id));
  const art = mergeArt(ordered.flatMap((p) => [store.art(p.id), matched(p.id)]));
  known.set(key, art);
  return art;
}

/**
 * Packs game.json names that this server doesn't have or that are for
 * another system, and documents in their rules content the system can't read.
 */
export function gamePackIssues(
  store: PackStore | undefined,
  game: GamePacks,
  system: Pick<SystemDefinition, 'id' | 'packContentIssues'>,
): string[] {
  if (!store) return [];
  return (game.packs ?? []).flatMap((id) => {
    const pack = store.get(id);
    if (!pack) return [`pack "${id}" is not installed on this server (data/packs/${id}/)`];
    if (pack.system !== null && pack.system !== system.id) return [`pack "${id}" is for the "${pack.system}" system`];
    const check = system.packContentIssues ?? (() => []);
    return store.compendia(id).flatMap((c) => check(c).map((issue) => `pack "${id}": ${issue}`));
  });
}

type RunningGame = Pick<GameStore, 'packs' | 'campaign' | 'system' | 'docs'>;

/**
 * The rules content (D&D: monsters, items, spells, classes) of the packs a
 * running game turns on and of its own homebrew. The same list while nothing
 * changes, so content built from it is cached.
 */
export function packContent(store: RunningGame): PackCompendium[] {
  const packs = contentCompendia(store.packs, store.campaign, store.system);
  return gameCompendia(store, packs, store.docs.all('homebrew'), (d) => fromDoc(d));
}

/** The art of a running game's packs. */
export const packArtOf = (store: RunningGame): ArtIndex => gameArt(store.packs, store.campaign, store.system);

/** What a token in a running game can refer to: its edition's SRD plus the game's packs. */
export function contentFor(
  store: RunningGame & Pick<GameStore, 'world'>,
  token: Pick<Token, 'stats' | 'own'>,
): Content {
  const content = contentWith(editionOf(token, store.world), packContent(store));
  return withOwn(withSettings(content, store.world.settings), token);
}

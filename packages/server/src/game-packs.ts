import { enabledPacks, type PackCompendium, type PackInfo, type SystemDefinition } from '@vtt/core';
import { type Content, contentWith, editionOf, type Token } from '@vtt/system-dnd5e';
import type { GameStore } from './game-store.ts';
import type { PackStore } from './pack-store.ts';

// Which packs a game uses: its system's own (always on) and the installed
// packs game.json `packs` turns on, if they fit its system. Their monster,
// item and spell compendia (whatever the system calls rules content) add to
// what the game's tokens can refer to.

/** What of game.json the packs depend on. */
interface GamePacks {
  system: string;
  packs?: readonly string[];
}

type System = Pick<SystemDefinition, 'id' | 'packs' | 'contentTypes'>;

/** The system's packs, then every installed pack for its system or for none, with whether the game uses it. */
export function packInfos(store: PackStore | undefined, game: GamePacks, system: System): PackInfo[] {
  const on = new Set(game.packs ?? []);
  const builtin = (system.packs ?? []).map((p): PackInfo => ({ ...p.manifest, builtin: true, enabled: true }));
  const installed = (store?.list() ?? [])
    .filter((p) => p.system === null || p.system === system.id)
    .map((p): PackInfo => ({ ...p, enabled: on.has(p.id) }));
  return [...builtin, ...installed];
}

const cache = new WeakMap<PackStore, { revision: number; lists: Map<string, PackCompendium[]> }>();

/** The cached lists of a store, emptied when its packs were read again. */
function listsOf(store: PackStore): Map<string, PackCompendium[]> {
  let known = cache.get(store);
  if (known?.revision !== store.revision) {
    known = { revision: store.revision, lists: new Map() };
    cache.set(store, known);
  }
  return known.lists;
}

/**
 * The rules-content compendia of the packs a game turned on. The same list
 * comes back while the packs and the game's choice stay the same, so the
 * system can cache what it builds from it.
 */
export function contentCompendia(store: PackStore | undefined, game: GamePacks, system: System): PackCompendium[] {
  if (!store || !game.packs?.length || !system.contentTypes?.length) return [];
  const key = `${system.id}|${game.packs.join(',')}`;
  const known = listsOf(store);
  const hit = known.get(key);
  if (hit) return hit;
  const types = new Set(system.contentTypes);
  const list = enabledPacks(store.list(), game.packs, system.id).flatMap((p) =>
    store.compendia(p.id).filter((c) => types.has(c.type)),
  );
  known.set(key, list);
  return list;
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

type RunningGame = Pick<GameStore, 'packs' | 'campaign' | 'system'>;

/** The rules content (D&D: monsters, items, spells) of the packs a running game turns on. */
export function packContent(store: RunningGame): PackCompendium[] {
  return contentCompendia(store.packs, store.campaign, store.system);
}

/** What a token in a running game can refer to: its edition's SRD plus the game's packs. */
export function contentFor(store: RunningGame & Pick<GameStore, 'world'>, token: Pick<Token, 'stats'>): Content {
  return contentWith(editionOf(token, store.world), packContent(store));
}

import type { Tile } from '@vtt/shared';

// Baileywiki's Unlimited Terrain spawners (Mass Edit presets that cover
// the scene with a repeating picture) all start on the same cave floor: in
// Foundry the spawn then opens a picker on the "tileable-streets" folders
// (nuts-and-bolts' Unlimited Terrain macro). The spawner's name says which
// folder it means ("Grassland and Hills": grassy-terrain), so the import
// picks that folder's first picture.

const TILEABLE = /\/tileable-streets\/([^/]+)\/[^/]+$/;

/** The first letters of a word, enough to tell grass from gravel and match "grassland" with "grassy". */
const stem = (word: string) => word.toLowerCase().slice(0, 5);

const folderOf = (path: string | undefined) => (path ? TILEABLE.exec(path)?.[1] : undefined);

/** The tileable pictures by their folder, first by name, thumbnails left out. */
function byFolder(have: Iterable<string>): Map<string, string> {
  const out = new Map<string, string>();
  const sorted = [...have].filter((p) => TILEABLE.test(p) && !/_thumb\.[^.]+$/.test(p));
  sorted.sort((a, b) => a.localeCompare(b));
  for (const path of sorted) {
    const folder = folderOf(path)!;
    if (!out.has(folder)) out.set(folder, path);
  }
  return out;
}

/**
 * The picture a spawner named `name` should repeat, when its own (`own`, a
 * path under the data folder) is in a folder other than the one its name
 * names; undefined to keep its own.
 */
export function terrainPicker(have: Iterable<string>): (name: string, own: string | undefined) => string | undefined {
  let folders: Map<string, string> | undefined;
  return (name, own) => {
    const words = /Unlimited Terrain Spawner - (.*)$/i
      .exec(name)?.[1]
      ?.split(/[^a-z]+/i)
      .filter((w) => w.length > 3);
    if (!words?.length) return undefined;
    folders ??= byFolder(have);
    const meant = [...folders.keys()].find((f) =>
      words.some((w) => f.split('-').some((part) => stem(part) === stem(w))),
    );
    return meant && meant !== folderOf(own) ? folders.get(meant) : undefined;
  };
}

type Picker = ReturnType<typeof terrainPicker>;

/** A path under the data folder, from the pack's reference to it. */
const dataPath = (ref: string) => ref.replace(/^pack:\/\/[^/]+\/media\//, '');

/** A spawner prefab repeating the picture its name names (see `terrainPicker`). */
export function withTerrain<P extends { name: string; tiles: readonly Tile[] }>(
  prefab: P | undefined,
  pick: Picker,
  media: (path: string) => string | undefined,
): P | undefined {
  if (!prefab) return prefab;
  const tiles = prefab.tiles.map((t) => {
    if (t.kind !== 'image' || !t.repeat) return t;
    const meant = pick(prefab.name, t.repeat.src && dataPath(t.repeat.src));
    const src = meant && media(meant);
    return src ? { ...t, repeat: { ...t.repeat, src } } : t;
  });
  return { ...prefab, tiles };
}

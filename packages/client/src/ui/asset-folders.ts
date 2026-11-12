import type { MediaEntry } from '@vtt/core';

// The Assets tab's folders: a pack's files (Baileywiki's thousands of props
// and models) are browsed the way they sit on disk, one folder at a time,
// starting from the game's own files and each pack.

/** A folder to open: its name, its whole path, and how many files are under it. */
export interface Folder {
  name: string;
  path: string[];
  count: number;
}

/** Where a file sits: its pack ("" for the game's own files), then its folders. */
export function folderOf(m: MediaEntry): string[] {
  const path = m.pack ? m.src.slice(`pack://${m.pack}/`.length) : m.src.replace(/^\/assets\//, '');
  return [m.pack ?? '', ...path.split('/').slice(0, -1)];
}

/** A model kit's own textures (Baileywiki's zz-textures, zz-meshes): parts of models, not things to place. */
const isPart = (path: readonly string[]) => path.some((dir) => dir.startsWith('zz-'));

const under = (path: readonly string[], at: readonly string[]) => at.every((dir, i) => path[i] === dir);

/** Everything under the folder `at`, however deep, without the parts of models. */
export function within(media: readonly MediaEntry[], at: readonly string[]): MediaEntry[] {
  return media.filter((m) => {
    const path = folderOf(m);
    return !isPart(path) && under(path, at);
  });
}

/** The folder `at` (or the one it leads straight down to): the folders in it, by name, and its own files. */
export function browse(
  media: readonly MediaEntry[],
  at: readonly string[],
): { at: string[]; folders: Folder[]; files: MediaEntry[] } {
  const here = within(media, at).map((m) => ({ m, path: folderOf(m) }));
  const files = here
    .filter(({ path }) => path.length === at.length)
    .map(({ m }) => m)
    .sort((a, b) => a.name.localeCompare(b.name));
  const counts = new Map<string, number>();
  for (const { path } of here) {
    const next = path[at.length];
    if (next !== undefined && path.length > at.length) counts.set(next, (counts.get(next) ?? 0) + 1);
  }
  const folders = [...counts]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, path: [...at, name], count }));
  // A folder of one folder: open that one (at the top, the game and its packs always show).
  if (at.length > 0 && folders.length === 1 && !files.length) return browse(media, folders[0]!.path);
  return { at: [...at], folders, files };
}

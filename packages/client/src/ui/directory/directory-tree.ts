import type { Doc } from '@vtt/core';

// What a sidebar list shows: its folders nested as they sit, each with the
// entries in it by name, and the entries in no folder (or in one the list
// doesn't have) at the top. A search or a filter keeps only the entries that
// match, and the folders on the way to them.

/** One thing in a list, as far as finding and filing it goes. */
export interface DirEntry {
  key: string;
  name: string;
  /** The folder it is in. */
  folder?: string;
  /** Values the list's filters pick on: { type: 'monster' }. */
  tags?: Readonly<Record<string, string>>;
  /** More words it is found by besides its name. */
  search?: string;
}

export interface FolderNode<E extends DirEntry = DirEntry> {
  folder: Doc;
  folders: FolderNode<E>[];
  entries: E[];
  /** Entries in it and in the folders below. */
  count: number;
}

export interface TreeOptions {
  query?: string;
  picks?: Readonly<Record<string, string | undefined>>;
  /** Keep folders with nothing in them (the GM's view, when nothing narrows the list). */
  keepEmpty?: boolean;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
const bySort = (a: Doc, b: Doc) => str(a.sort).localeCompare(str(b.sort)) || str(a.name).localeCompare(str(b.name));

function matcher(options: TreeOptions): (e: DirEntry) => boolean {
  const words = (options.query ?? '').trim().toLowerCase();
  const picks = Object.entries(options.picks ?? {}).filter(([, v]) => v);
  return (e) =>
    (!words || `${e.name} ${e.search ?? ''}`.toLowerCase().includes(words)) &&
    picks.every(([k, v]) => e.tags?.[k] === v);
}

/** Whether a search or filter narrows the list. */
export function narrowed(options: TreeOptions): boolean {
  return !!options.query?.trim() || Object.values(options.picks ?? {}).some(Boolean);
}

export function directoryTree<E extends DirEntry>(
  folders: readonly Doc[],
  entries: readonly E[],
  options: TreeOptions,
): { folders: FolderNode<E>[]; entries: E[] } {
  const known = new Set(folders.map((f) => f.id));
  // A folder whose parent is gone sits at the top.
  const parentOf = (f: Doc) => (known.has(str(f.parent)) ? str(f.parent) : undefined);
  const shown = entries.filter(matcher(options)).sort(byName);
  const keepEmpty = !!options.keepEmpty && !narrowed(options);
  const build = (parent: string | undefined, seen: ReadonlySet<string>): FolderNode<E>[] =>
    folders
      .filter((f) => parentOf(f) === parent && !seen.has(f.id))
      .sort(bySort)
      .map((folder) => {
        const inner = build(folder.id, new Set([...seen, folder.id]));
        const own = shown.filter((e) => e.folder === folder.id);
        return { folder, folders: inner, entries: own, count: own.length + inner.reduce((n, f) => n + f.count, 0) };
      })
      .filter((node) => keepEmpty || node.count > 0);
  return { folders: build(undefined, new Set()), entries: shown.filter((e) => !e.folder || !known.has(e.folder)) };
}

/** How many entries have each value of a filter. */
export function filterCounts(entries: readonly DirEntry[], key: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) {
    const v = e.tags?.[key];
    if (v) out.set(v, (out.get(v) ?? 0) + 1);
  }
  return out;
}

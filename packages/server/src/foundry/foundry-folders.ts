import { keysBetween } from '@vtt/core';
import { type Folder, type FolderKind } from '@vtt/shared';
import type { FoundryDoc } from './foundry-db.ts';
import type { FolderLookup } from './foundry-entries.ts';
import { idMaker, num, str } from './foundry-actors.ts';

// A Foundry world's sidebar folders as ours (folders.ts in shared): the
// same names, nesting, colours and order, for the lists we have. Folders
// of other lists (items, compendia, adventures) stay behind.

const KINDS: Record<string, FolderKind> = {
  Actor: 'actors',
  Scene: 'scenes',
  JournalEntry: 'journals',
  RollTable: 'tables',
  Playlist: 'playlists',
  Macro: 'macros',
  Cards: 'cards',
};

const COLOUR = /^#[0-9a-f]{6}$/i;

/** Foundry's order: by `sort`, then by name. */
const byFoundrySort = (a: FoundryDoc, b: FoundryDoc) =>
  (num(a.sort) ?? 0) - (num(b.sort) ?? 0) || (str(a.name) ?? '').localeCompare(str(b.name) ?? '');

/** The folders, and our id for a Foundry folder id (undefined for one that stayed behind). */
export function foundryFolders(raw: FoundryDoc[]): { folders: Folder[]; folderOf: FolderLookup } {
  const kept = raw.filter((f) => str(f._id) && KINDS[String(f.type)]).sort(byFoundrySort);
  const idOf = new Map<string, string>();
  const nextId = idMaker('folder');
  for (const f of kept) idOf.set(f._id as string, nextId(str(f.name) ?? 'Folder'));
  const keys = keysBetween(null, null, kept.length);
  const folders = kept.map((f, i): Folder => {
    const parent = idOf.get(str(f.folder) ?? '');
    const color = str(f.color);
    return {
      id: idOf.get(f._id as string)!,
      name: str(f.name) ?? 'Folder',
      kind: KINDS[String(f.type)]!,
      sort: keys[i]!,
      ...(parent ? { parent } : {}),
      ...(color && COLOUR.test(color) ? { color } : {}),
    };
  });
  return { folders, folderOf: (id) => (id ? idOf.get(id) : undefined) };
}

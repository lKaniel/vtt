import { type Folder, FOLDERS, isFolderKind } from '@vtt/shared';
import type { GameFile, Issue } from './game-files.ts';

// check-game's look at the sidebar folders (folders.ts in shared): every
// document's `folder`, and every folder's `parent`, names a folder of the
// same list.

interface Filed {
  rel: string;
  file?: GameFile;
}

/** The list a file's document is in, and the folder it names. */
function filedIn(file: GameFile): { list: string; folder?: string } | undefined {
  if (file.kind === 'actor') return { list: 'actors', folder: file.data.folder };
  if (file.kind === 'scene') return { list: 'scenes', folder: file.data.folder };
  if (file.kind !== 'entry') return undefined;
  if (file.coll === FOLDERS) {
    const f = file.data as Folder;
    return { list: f.kind, folder: f.parent };
  }
  return isFolderKind(file.coll) ? { list: file.coll, folder: (file.data as { folder?: string }).folder } : undefined;
}

const isFolderFile = (file: GameFile | undefined) => file?.kind === 'entry' && file.coll === FOLDERS;

/** What is wrong with where one file's document is filed, if anything. */
function issueOf(file: GameFile, folders: ReadonlyMap<string, Folder>): string | undefined {
  const at = filedIn(file);
  if (!at?.folder) return undefined;
  const field = isFolderFile(file) ? 'parent' : 'folder';
  const folder = folders.get(at.folder);
  if (!folder) return `${field} "${at.folder}" is not in folders/`;
  if (folder.kind !== at.list) return `${field} "${at.folder}" is a folder of ${folder.kind}, not of ${at.list}`;
  return undefined;
}

/** Documents and folders in a folder that isn't there, or holds another list. */
export function folderIssues(entries: readonly Filed[]): Issue[] {
  const folders = new Map(
    entries.flatMap(({ file }) =>
      file?.kind === 'entry' && isFolderFile(file) ? [[file.id, file.data as Folder]] : [],
    ),
  );
  return entries
    .flatMap(({ rel, file }) => {
      const message = file && issueOf(file, folders);
      return message ? [{ file: rel, message }] : [];
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

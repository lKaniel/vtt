import type { Doc, DocRef, DocStore, Op } from '@vtt/core';
import { type FolderKind, FOLDERS, foldersOf, moveToFolderOps, newFolderOps } from '@vtt/shared';

// The sidebar lists' folders (folders.ts in shared) and what the GM does
// with them: make, rename, colour, move, delete (what it held moves up, on
// the server), and move documents into them. Each is one undo step.
// Reached as `session.folders`.

/** What the folders need of the session: its documents and a way to send edits. */
export interface FolderHost {
  readonly docs: DocStore;
  readonly edits: { sendChanges(label: string, ops: readonly Op[]): void };
}

export class Folders {
  constructor(private readonly s: FolderHost) {}

  /** The folders of one list, as you were sent them. */
  of(kind: FolderKind): Doc[] {
    return foldersOf(this.s.docs, kind);
  }

  /** A new folder, in `parent` when given; its id. */
  create(kind: FolderKind, name: string, parent?: string): string {
    const { id, ops } = newFolderOps(this.s.docs, { kind, name, ...(parent ? { parent } : {}) });
    this.s.edits.sendChanges('new folder', ops);
    return id;
  }

  /** The top-level folder of a list named `name`, made when there is none. */
  ensure(kind: FolderKind, name: string): string {
    const found = this.of(kind).find((f) => !f.parent && f.name === name);
    return found?.id ?? this.create(kind, name);
  }

  rename(id: string, name: string): void {
    this.patch(id, { name }, 'rename folder');
  }

  /** Its colour, or none. */
  color(id: string, color: string | undefined): void {
    this.patch(id, { color: color ?? null }, 'folder colour');
  }

  /** Deletes a folder; what was in it moves up a level. */
  remove(id: string): void {
    this.s.edits.sendChanges('delete folder', [{ op: 'delete', coll: FOLDERS, id }]);
  }

  /** Puts documents or folders into folder `to` (undefined: the top of their list). */
  move(refs: readonly DocRef[], to: string | undefined): void {
    const ops = moveToFolderOps(this.s.docs, refs, to);
    if (ops.length) this.s.edits.sendChanges('move to folder', ops);
  }

  private patch(id: string, patch: Record<string, unknown>, label: string): void {
    this.s.edits.sendChanges(label, [{ op: 'update', coll: FOLDERS, id, patch }]);
  }
}

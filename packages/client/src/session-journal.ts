import { type Doc, freeId, type Patch } from '@vtt/core';
import {
  ENTRY_TYPES,
  type EntryType,
  playPatch,
  type Playlist,
  resetPatch,
  type RollTable,
  stopPatch,
} from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { ItemSession } from './session-items.ts';

// Journal entries, roll tables and playlists: the sidebar's own documents.
// Entries open in a viewer (a map note opens its entry; the GM can show one
// to every player); the GM rolls on tables and starts and stops playlists.

/** A journal entry open in the viewer. */
export interface OpenJournal {
  entry: string;
  page?: string;
}

const NEW: Record<EntryType, Record<string, unknown>> = {
  journal: { name: 'New entry', pages: [] },
  rolltable: { name: 'New table', results: [{ text: 'Something' }] },
  playlist: { name: 'New playlist', mode: 'sequence', tracks: [] },
};

export abstract class JournalSession extends ItemSession {
  /** The entry open in the viewer. */
  journal?: OpenJournal;

  protected abstract changed(): void;

  openJournal(entry: string, page?: string): void {
    this.journal = page ? { entry, page } : { entry };
    this.changed();
  }

  closeJournal(): void {
    this.journal = undefined;
    this.changed();
  }

  /** GM: opens an entry for every player (and lets them see it). */
  showJournal(entry: string, page?: string): void {
    this.send({ t: 'showJournal', entry, ...(page ? { page } : {}) });
  }

  /** Rolls on a table; `gmOnly` whispers the result to the GM. */
  rollTable(table: string, gmOnly = false): void {
    this.send({ t: 'rollTable', table, ...(gmOnly ? { gmOnly } : {}) });
  }

  resetTable(id: string): void {
    const t = this.docs.get('tables', id);
    if (t) this.patchEntry('tables', id, resetPatch(t as unknown as RollTable), 'table reset');
  }

  /** Starts a playlist, at `track` or its first. */
  playPlaylist(id: string, track?: string): void {
    const p = this.docs.get('playlists', id);
    if (p) this.patchEntry('playlists', id, playPatch(p as unknown as Playlist, track), 'music');
  }

  stopPlaylist(id: string): void {
    const p = this.docs.get('playlists', id);
    if (p) this.patchEntry('playlists', id, stopPatch(p as unknown as Playlist), 'stop music');
  }

  /** GM: a new journal entry, table or playlist, ready to fill in. */
  createEntry(type: EntryType): void {
    const { coll } = ENTRY_TYPES[type];
    const id = freeId(type, (x) => !!this.docs.get(coll, x));
    const doc = { id, type, rev: 0, ...NEW[type] } as Doc;
    this.sendChanges('new', [{ op: 'create', coll, doc }]);
  }

  /** Changes one sidebar document's fields. */
  patchEntry(coll: string, id: string, patch: Patch, label = 'edit'): void {
    this.sendUpdates(label, [{ ref: { coll, id }, patch }]);
  }

  protected override applyEdit(msg: ServerMessage): boolean {
    if (msg.t !== 'showJournal') return super.applyEdit(msg);
    this.openJournal(msg.entry, msg.page);
    return true;
  }
}

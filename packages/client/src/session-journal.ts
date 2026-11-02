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
import type { MacroCard } from './actions.ts';
import { ItemSession } from './session-items.ts';

// Journal entries, roll tables, playlists and macros: the sidebar's own documents.
// Entries open in a viewer (a map note opens its entry; the GM can show one
// to every player, and a picture too); the GM rolls on tables and starts and stops playlists.

/** A journal entry open in the viewer. */
export interface OpenJournal {
  entry: string;
  page?: string;
}

const NEW: Record<EntryType, Record<string, unknown>> = {
  journal: { name: 'New entry', pages: [] },
  rolltable: { name: 'New table', results: [{ text: 'Something' }] },
  playlist: { name: 'New playlist', mode: 'sequence', tracks: [] },
  macro: { name: 'New macro', kind: 'chat', command: '' },
};

/** A picture the GM showed. */
export interface ShownImage {
  src: string;
  title?: string;
}

export abstract class JournalSession extends ItemSession {
  /** The entry open in the viewer. */
  journal?: OpenJournal;
  /** The picture the GM showed you, open until you close it. */
  shownImage?: ShownImage;

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

  /** GM: opens a picture on every player's screen. */
  showImage(src: string, title?: string): void {
    this.send({ t: 'showImage', src, ...(title ? { title } : {}) });
  }

  closeImage(): void {
    this.shownImage = undefined;
    this.changed();
  }

  /** Your seat's colour and picture; a null avatar takes it away. */
  setProfile(profile: { color?: string; avatar?: string | null }): void {
    this.send({ t: 'profile', ...profile });
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

  /** A new journal entry, table, playlist or macro, ready to fill in; a player's macro is signed as theirs. */
  createEntry(type: EntryType): void {
    const { coll } = ENTRY_TYPES[type];
    const id = freeId(type, (x) => !!this.docs.get(coll, x));
    const author = type === 'macro' && !this.isGm() && this.you ? { author: this.you.id } : {};
    const doc = { id, type, rev: 0, ...NEW[type], ...author } as Doc;
    this.sendChanges('new', [{ op: 'create', coll, doc }]);
  }

  /** Runs a macro's chat lines, said by `token` when you control it. */
  runMacro(macro: string, token?: string): void {
    this.send({ t: 'runMacro', macro, ...(token ? { token } : {}) });
  }

  /** A macro you were sent, as the hotbar shows it. */
  readonly macroOf = (id: string): MacroCard | undefined => {
    const doc = this.docs.get('macros', id);
    if (!doc) return undefined;
    const text = (k: string) => (typeof doc[k] === 'string' ? doc[k] : undefined);
    const img = text('img');
    return { id, name: text('name') ?? id, command: text('command') ?? '', ...(img && { img }) };
  };

  /** Removes a macro (yours, or any for the GM). */
  deleteMacro(id: string): void {
    this.sendChanges('delete macro', [{ op: 'delete', coll: 'macros', id }]);
  }

  /** Whether you may change a macro: the GM any, a player their own. */
  canEditMacro(id: string): boolean {
    return this.isGm() || (!!this.you && this.docs.get('macros', id)?.author === this.you.id);
  }

  /** Changes one sidebar document's fields. */
  patchEntry(coll: string, id: string, patch: Patch, label = 'edit'): void {
    this.sendUpdates(label, [{ ref: { coll, id }, patch }]);
  }

  /** A trigger played a sound for the scene. */
  protected abstract heard(src: string, volume: number): void;

  protected override applyEdit(msg: ServerMessage): boolean {
    if (msg.t === 'showImage') {
      this.shownImage = msg.title ? { src: msg.src, title: msg.title } : { src: msg.src };
      return true;
    }
    if (msg.t === 'sound') {
      this.heard(msg.src, msg.volume ?? 1);
      return false;
    }
    if (msg.t !== 'showJournal') return super.applyEdit(msg);
    this.openJournal(msg.entry, msg.page);
    return true;
  }
}

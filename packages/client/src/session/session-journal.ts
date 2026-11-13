import type { SessionPart } from './session-part.ts';
import { type Doc, type DocRef, type DocStore, freeId, type Op, type Patch, slugify } from '@vtt/core';
import {
  ENTRY_TYPES,
  isScriptMacro,
  type EntryType,
  isGm,
  type Player,
  playPatch,
  type Playlist,
  resetPatch,
  type RollTable,
  stopPatch,
} from '@vtt/shared';
import type { ClientMessage, ServerMessage } from '@vtt/system-dnd5e';
import type { MacroCard } from '../play/actions.ts';

// Journal entries, roll tables, playlists and macros: the sidebar's own documents.
// Entries open in a viewer (a map note opens its entry; the GM can show one
// to every player, and a picture too); the GM rolls on tables and starts and stops playlists.
// Reached as `session.journal`.

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
  cards: { name: 'New deck', kind: 'deck', cards: [] },
};

/** A track's name from its file: "/assets/uploads/rain-on-roof.ogg" is "rain on roof". */
const nameOfFile = (src: string) =>
  (src.split('/').at(-1) ?? '')
    .replace(/\.[^.]*$/, '')
    .replaceAll(/[-_]+/g, ' ')
    .trim() || 'Track';

/** A picture the GM showed. */
export interface ShownImage {
  src: string;
  title?: string;
}

/** What the journal needs of the session: its documents, your seat, and a way to the server. */
export interface JournalHost {
  readonly docs: DocStore;
  readonly you?: Player;
  send(msg: ClientMessage): void;
  readonly edits: { sendChanges(label: string, ops: readonly Op[]): void };
}

/** What the journal hands back to the session. */
export interface JournalEvents {
  changed(): void;
  /** Sends field patches as one undo step. */
  updates(label: string, updates: readonly { ref: DocRef; patch: Patch }[]): void;
  /** Runs a script macro in this browser (the GM's: players are never sent scripts). */
  runScript(doc: Doc, token?: string): Promise<void>;
  /** A trigger played a sound for the scene. */
  heard(src: string, volume: number): void;
}

/** The sidebar's own documents and the entry viewer, as `session.journal`. */
export class Journal implements SessionPart {
  /** The entry open in the viewer. */
  current?: OpenJournal;
  /** The picture the GM showed you, open until you close it. */
  shownImage?: ShownImage;

  constructor(
    private readonly s: JournalHost,
    private readonly on: JournalEvents,
  ) {}

  private gm(): boolean {
    return !!this.s.you && isGm(this.s.you);
  }

  open(entry: string, page?: string): void {
    this.current = page ? { entry, page } : { entry };
    this.on.changed();
  }

  close(): void {
    this.current = undefined;
    this.on.changed();
  }

  /** GM: opens an entry for every player (and lets them see it). */
  show(entry: string, page?: string): void {
    this.s.send({ t: 'showJournal', entry, ...(page ? { page } : {}) });
  }

  /** GM: opens a picture on every player's screen. */
  showImage(src: string, title?: string): void {
    this.s.send({ t: 'showImage', src, ...(title ? { title } : {}) });
  }

  closeImage(): void {
    this.shownImage = undefined;
    this.on.changed();
  }

  /** Rolls on a table; `gmOnly` whispers the result to the GM. */
  rollTable(table: string, gmOnly = false): void {
    this.s.send({ t: 'rollTable', table, ...(gmOnly ? { gmOnly } : {}) });
  }

  resetTable(id: string): void {
    const t = this.s.docs.get('tables', id);
    if (t) this.patchEntry('tables', id, resetPatch(t as unknown as RollTable), 'table reset');
  }

  /** Starts a playlist, at `track` or its first. */
  playPlaylist(id: string, track?: string): void {
    const p = this.s.docs.get('playlists', id);
    if (p) this.patchEntry('playlists', id, playPatch(p as unknown as Playlist, track), 'music');
  }

  /** GM: a soundboard's sound plays once for everyone at the table, at its volume times the board's. */
  playSound(board: string, track: string): void {
    const p = this.s.docs.get('playlists', board) as unknown as Playlist | undefined;
    const sound = p?.tracks.find((tr) => tr.id === track);
    if (!p || !sound) return;
    const volume = (sound.volume ?? 1) * (p.volume ?? 1);
    this.s.send({ t: 'playSound', src: sound.src, ...(volume !== 1 && { volume }) });
  }

  /** GM: adds a track (a soundboard's sound) by its file; `name` defaults to the file's. */
  addTrack(playlist: string, src: string, name = nameOfFile(src)): void {
    const p = this.s.docs.get('playlists', playlist) as unknown as Playlist | undefined;
    if (!p) return;
    const id = freeId(slugify(name) || 'track', (x) => p.tracks.some((tr) => tr.id === x), { bare: true });
    this.patchEntry('playlists', playlist, { tracks: [...p.tracks, { id, name, src }] }, 'add track');
  }

  removeTrack(playlist: string, track: string): void {
    const p = this.s.docs.get('playlists', playlist) as unknown as Playlist | undefined;
    if (p) this.patchEntry('playlists', playlist, { tracks: p.tracks.filter((tr) => tr.id !== track) }, 'remove track');
  }

  stopPlaylist(id: string): void {
    const p = this.s.docs.get('playlists', id);
    if (p) this.patchEntry('playlists', id, stopPatch(p as unknown as Playlist), 'stop music');
  }

  /**
   * A new journal entry (opened to fill in), table, playlist or macro; `fields`
   * set more (a quest, a date). A player's macro is signed as theirs.
   */
  createEntry(type: EntryType, fields: Record<string, unknown> = {}): void {
    const { coll } = ENTRY_TYPES[type];
    const id = freeId(type, (x) => !!this.s.docs.get(coll, x));
    const author = type === 'macro' && !this.gm() && this.s.you ? { author: this.s.you.id } : {};
    const doc = { id, type, rev: 0, ...NEW[type], ...author, ...fields } as Doc;
    this.s.edits.sendChanges('new', [{ op: 'create', coll, doc }]);
    if (type === 'journal') this.open(id);
  }

  /** Runs a macro for `token`: a chat macro's lines on the server, said by `token` when you control it; a script here. */
  async runMacro(macro: string, token?: string): Promise<void> {
    const doc = this.s.docs.get('macros', macro);
    if (doc && isScriptMacro(doc)) return this.on.runScript(doc, token);
    this.s.send({ t: 'runMacro', macro, ...(token ? { token } : {}) });
  }

  /** A macro you were sent, as the hotbar shows it. */
  readonly macroOf = (id: string): MacroCard | undefined => {
    const doc = this.s.docs.get('macros', id);
    if (!doc) return undefined;
    const text = (k: string) => (typeof doc[k] === 'string' ? doc[k] : undefined);
    const img = text('img');
    return { id, name: text('name') ?? id, command: text('command') ?? '', ...(img && { img }) };
  };

  /** Removes a macro (yours, or any for the GM). */
  deleteMacro(id: string): void {
    this.deleteEntry('macros', id);
  }

  /** Removes a sidebar document: an entry, a table, a playlist, a macro, a card stack. */
  deleteEntry(coll: string, id: string): void {
    this.s.edits.sendChanges('delete', [{ op: 'delete', coll, id }]);
  }

  /** Whether you may change a macro: the GM any, a player their own. */
  canEditMacro(id: string): boolean {
    return this.gm() || (!!this.s.you && this.s.docs.get('macros', id)?.author === this.s.you.id);
  }

  /** GM: a new homebrew document (a class), its fields ready (see homebrew.ts in the system). */
  createHomebrew(fields: { id: string; kind: string; name: string } & Record<string, unknown>): void {
    const doc = { ...fields, type: 'homebrew', rev: 0 } as Doc;
    this.s.edits.sendChanges('new homebrew', [{ op: 'create', coll: 'homebrew', doc }]);
  }

  /** Changes one sidebar document's fields. */
  patchEntry(coll: string, id: string, patch: Patch, label = 'edit'): void {
    this.on.updates(label, [{ ref: { coll, id }, patch }]);
  }

  /** A message for the journal: whether the screen changed, or undefined when it is someone else's. */
  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t === 'showImage') {
      this.shownImage = msg.title ? { src: msg.src, title: msg.title } : { src: msg.src };
      return true;
    }
    if (msg.t === 'sound') {
      this.on.heard(msg.src, msg.volume ?? 1);
      return false;
    }
    if (msg.t !== 'showJournal') return undefined;
    this.open(msg.entry, msg.page);
    return true;
  }
}

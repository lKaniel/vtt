import { type Doc, type DocRef, type DocStore, freeId, type Op, type Patch } from '@vtt/core';
import { type BookTab, inBook, isGm, type Player } from '@vtt/shared';

// The adventure book a player opens with J, as Simple Quest's was in
// Foundry: the journal entries they may see, on tabs (quests, maps, lore,
// the party log, the timeline; adventure-book.ts in shared). Players write
// notes of their own in the party log and may share them with the party.
// Reached as `session.book`.

/** What the book needs of the session: its documents, your seat, and a way to send edits. */
export interface BookHost {
  readonly docs: DocStore;
  readonly you?: Player;
  readonly edits: { sendChanges(label: string, ops: readonly Op[]): void };
}

/** What the book hands back to the session. */
export interface BookEvents {
  changed(): void;
  updates(label: string, updates: readonly { ref: DocRef; patch: Patch }[]): void;
}

const nameOf = (d: Doc) => (typeof d.name === 'string' ? d.name : '');
const byName = (a: Doc, b: Doc) => nameOf(a).localeCompare(nameOf(b));

export class Book {
  /** The open tab; undefined while the book is shut. */
  tab?: BookTab;
  /** The entry open on the right-hand page. */
  selected?: string;
  /** The tab the book opens on again. */
  private last: BookTab = 'quests';

  constructor(
    private readonly s: BookHost,
    private readonly on: BookEvents,
  ) {}

  /** Opens the book on `tab` (the one it was last on), at an entry. */
  open(tab: BookTab = this.last, entry?: string): void {
    this.tab = tab;
    this.last = tab;
    if (entry !== undefined) this.selected = entry;
    this.on.changed();
  }

  close(): void {
    this.tab = undefined;
    this.on.changed();
  }

  /** J: opens the book, or shuts it. */
  toggle(): void {
    if (this.tab) this.close();
    else this.open();
  }

  select(entry: string | undefined): void {
    this.selected = entry;
    this.on.changed();
  }

  /** The entries you may see under a tab, by name (the timeline by date). */
  entries(tab: BookTab): Doc[] {
    const all = this.s.docs.all('journals');
    return inBook(tab === 'timeline' ? all : [...all].sort(byName), tab);
  }

  private gm(): boolean {
    return !!this.s.you && isGm(this.s.you);
  }

  /** Whether you may write in an entry: the GM any, a player their own notes. */
  canWrite(id: string): boolean {
    if (this.gm()) return true;
    return !!this.s.you && this.s.docs.get('journals', id)?.author === this.s.you.id;
  }

  /** A new note in the party log, opened to fill in; a player's is signed as theirs. */
  writeNote(): void {
    const id = freeId('note', (x) => !!this.s.docs.get('journals', x));
    const author = !this.gm() && this.s.you ? { author: this.s.you.id } : {};
    const page = { id: 'notes', name: 'Notes', kind: 'text', text: '' };
    const doc = { id, type: 'journal', rev: 0, name: 'New note', book: 'log', pages: [page], ...author } as Doc;
    this.s.edits.sendChanges('new note', [{ op: 'create', coll: 'journals', doc }]);
    this.open('log', id);
  }

  /** Lets the whole party read a note, or keeps it to yourself again. */
  share(id: string, shared: boolean): void {
    this.patch(id, { ownership: shared ? { default: 'observer' } : null }, shared ? 'share note' : 'unshare note');
  }

  /** Changes an entry's fields (its name, its pages). */
  patch(id: string, patch: Patch, label = 'edit'): void {
    this.on.updates(label, [{ ref: { coll: 'journals', id }, patch }]);
  }

  /** Removes one of your notes. */
  deleteNote(id: string): void {
    this.s.edits.sendChanges('delete note', [{ op: 'delete', coll: 'journals', id }]);
    if (this.selected === id) this.select(undefined);
  }
}

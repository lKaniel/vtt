import {
  type Clip,
  clipboardText,
  type Doc,
  type DocRef,
  DocStore,
  type Op,
  parseClipboard,
  type Patch,
} from '@vtt/core';
import {
  applyPatch,
  copyRefs,
  deleteRefs,
  type HistoryState,
  type Player,
  pasteAt,
  pasteOffsetTo,
  type Point,
} from '@vtt/shared';
import type { ClientMessage, ServerMessage } from '@vtt/system-dnd5e';
import { mayEditRefs, pastableBy } from './authorship.ts';
import type { SessionPart, Welcome } from './session-part.ts';

// Copy, cut, paste, duplicate, delete, undo and redo, for every kind of
// document: the registry in shared (edit-kinds.ts) turns them into ops, the
// server checks and applies them, and keeps each user's undo history.

/** A document as it was before an edit this client showed early, and as the edit leaves it. */
interface Shown {
  coll: string;
  id: string;
  before?: Doc;
  after?: Doc;
}

/** What the edit commands need of the session. */
export interface EditHost {
  /** The document mirror: the welcome replaces it. */
  docs: DocStore;
  readonly you?: Player;
  readonly scene: string;
  /** Where the pointer is on the map: pastes land there. */
  readonly pointer?: Point;
  readonly editor: { viewCentre(): Point };
  send(msg: ClientMessage): void;
  showError(message: string): void;
}

/** What the edits tell the session. */
export interface EditEvents {
  /** The document mirror changed. */
  docsChanged(): void;
  /** What the edit commands work on: the selected token, or the actor whose sheet is open. */
  editTargets(): DocRef[];
  gridSize(): number;
  /** News such as "Undid the move". */
  notice(message: string): void;
}

export class Edits implements SessionPart {
  /** What undo and redo would do now. */
  history: HistoryState = {};
  /** The last copy, for when the system clipboard can't be read or holds something else. */
  private clip?: Clip;
  private txns = 0;
  /** Edits shown before the server confirmed them: the documents as they were, by transaction. */
  private pending = new Map<string, Shown[]>();

  constructor(
    private readonly s: EditHost,
    private readonly on: EditEvents,
  ) {}

  undo(): void {
    this.s.send({ t: 'undo' });
  }

  redo(): void {
    this.s.send({ t: 'redo' });
  }

  /** GM: undo the game action this chat card reports (only the latest can be). */
  undoCard(card: string): void {
    this.s.send({ t: 'undo', card });
  }

  /** The edit targets, if this client may edit them all (see authorship.ts); else none. */
  private editable(): DocRef[] {
    const refs = this.on.editTargets();
    return mayEditRefs(this.s.you, this.s.docs, refs) ? refs : [];
  }

  /** Copies what is selected; the text to put on the system clipboard, or undefined when there is nothing. */
  copy(): string | undefined {
    const refs = this.editable();
    const clip = copyRefs(this.s.docs, refs);
    if (!clip.docs.length) return undefined;
    this.clip = clip;
    return clipboardText(clip);
  }

  /** Copy plus delete, in one transaction so one undo puts it back. */
  cut(): string | undefined {
    const text = this.copy();
    if (text) this.sendOps('cut', deleteRefs(this.s.docs, this.editable()));
    return text;
  }

  /** Pastes `text` from the system clipboard (or the last copy) at the pointer, keeping its layout. */
  paste(text?: string): void {
    const found = (text ? parseClipboard(text) : undefined) ?? this.clip;
    const clip = found && pastableBy(this.s.you, found);
    if (!clip) return;
    const offset = pasteOffsetTo(clip, this.s.pointer ?? this.s.editor.viewCentre(), this.on.gridSize());
    this.sendOps('paste', pasteAt(this.s.docs, clip, { scene: this.s.scene, offset }).ops);
  }

  /** A copy of what is selected, one square over. */
  duplicate(): void {
    const clip = pastableBy(this.s.you, copyRefs(this.s.docs, this.editable()));
    if (!clip) return;
    const g = this.on.gridSize();
    this.sendOps('duplicate', pasteAt(this.s.docs, clip, { scene: this.s.scene, offset: [g, g] }).ops);
  }

  deleteSelected(): void {
    const refs = this.editable();
    if (refs.length) this.sendOps('delete', deleteRefs(this.s.docs, refs));
  }

  private sendOps(label: string, ops: Op[]): string | undefined {
    if (!ops.length) return undefined;
    const txn = `${label}-${++this.txns}`;
    this.s.send({ t: 'ops', txn, label, ops });
    return txn;
  }

  /**
   * Patches documents as this client has them, in one transaction, and shows
   * the result at once; a refusal puts them back.
   */
  sendUpdates(label: string, updates: readonly { ref: DocRef; patch: Patch }[]): void {
    const ops = updates.flatMap(({ ref, patch }): Op[] => {
      const doc = this.s.docs.get(ref.coll, ref.id);
      if (!doc || !Object.keys(patch).length) return [];
      return [{ op: 'update', coll: ref.coll, id: ref.id, rev: doc.rev, patch }];
    });
    this.sendChanges(label, ops);
  }

  /**
   * Sends a transaction of creates, updates and deletes (one undo step) and
   * shows it at once, as the server will leave the documents; a refusal puts them back.
   */
  sendChanges(label: string, ops: readonly Op[]): void {
    const shown = ops.map((op) => this.optimistic(op));
    const txn = this.sendOps(label, [...ops]);
    if (!txn) return;
    this.pending.set(txn, shown);
    this.s.docs.mirror(shown.map(({ coll, id, after }) => ({ coll, id, doc: after })));
    this.on.docsChanged();
  }

  /** A document before and after an op, as the server applies it. */
  private optimistic(op: Op): Shown {
    if (op.op === 'create') return { coll: op.coll, id: op.doc.id, after: { ...op.doc, rev: op.doc.rev + 1 } };
    const before = this.s.docs.get(op.coll, op.id);
    if (op.op === 'delete' || !before) return { coll: op.coll, id: op.id, before };
    // The server bumps the revision once per update, so a second edit before the echo still matches.
    return { coll: op.coll, id: op.id, before, after: { ...applyPatch(before, op.patch), rev: before.rev + 1 } };
  }

  /** A refused edit: put back what it changed, unless newer news came since. */
  private takeBack(txn: string): void {
    const shown = this.pending.get(txn) ?? [];
    this.pending.delete(txn);
    const current = shown.filter((s) => this.s.docs.get(s.coll, s.id)?.rev === s.after?.rev);
    if (!current.length) return;
    this.s.docs.mirror(current.map(({ coll, id, before }) => ({ coll, id, doc: before })));
    this.on.docsChanged();
  }

  /** The edit messages; undefined for any other. */
  receive(msg: ServerMessage): boolean | undefined {
    switch (msg.t) {
      case 'docs':
        if (msg.txn) this.pending.delete(msg.txn);
        this.s.docs.mirror(msg.changes);
        this.on.docsChanged();
        return true;
      case 'reject':
        this.takeBack(msg.txn);
        this.s.showError(msg.reason);
        return true;
      case 'history': {
        const { t: _t, ...state } = msg;
        this.history = state;
        return true;
      }
      case 'undone':
        this.on.notice(`${msg.redo ? 'Redid' : 'Undid'} the ${msg.label}`);
        return true;
      default:
        return undefined;
    }
  }

  welcome(msg: Welcome): void {
    this.s.docs = new DocStore();
    this.pending.clear();
    for (const [coll, docs] of Object.entries(msg.docs ?? {}))
      this.s.docs.mirror(docs.map((doc) => ({ coll, id: doc.id, doc })));
    this.history = msg.history;
  }
}

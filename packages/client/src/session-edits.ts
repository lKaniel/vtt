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
import { applyPatch, copyRefs, deleteRefs, type HistoryState, pasteAt, pasteOffsetTo, type Point } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { Commands } from './session-commands.ts';

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

export abstract class EditSession extends Commands {
  /** The game's documents as this client knows them (GM only for now), kept up to date by `docs` messages. */
  docs = new DocStore();
  /** What undo and redo would do now. */
  history: HistoryState = {};
  /** The scene everyone is on. */
  scene = '';
  /** Where the pointer is on the map: pastes land there. */
  pointer?: Point;
  /** The last copy, for when the system clipboard can't be read or holds something else. */
  private clip?: Clip;
  private txns = 0;
  /** Edits shown before the server confirmed them: the documents as they were, by transaction. */
  private pending = new Map<string, Shown[]>();

  /** What the edit commands work on: the selected token, or the actor whose sheet is open. */
  protected abstract editTargets(): DocRef[];
  protected abstract gridSize(): number;
  abstract isGm(): boolean;
  abstract viewCentre(): Point;
  abstract showError(message: string): void;
  abstract showNotice(message: string): void;
  /** The document mirror changed. */
  protected abstract docsChanged(): void;

  undo(): void {
    this.send({ t: 'undo' });
  }

  redo(): void {
    this.send({ t: 'redo' });
  }

  /** GM: undo the game action this chat card reports (only the latest can be). */
  undoCard(card: string): void {
    this.send({ t: 'undo', card });
  }

  /** Copies what is selected; the text to put on the system clipboard, or undefined when there is nothing. */
  copy(): string | undefined {
    const refs = this.isGm() ? this.editTargets() : [];
    const clip = copyRefs(this.docs, refs);
    if (!clip.docs.length) return undefined;
    this.clip = clip;
    return clipboardText(clip);
  }

  /** Copy plus delete, in one transaction so one undo puts it back. */
  cut(): string | undefined {
    const text = this.copy();
    if (text) this.sendOps('cut', deleteRefs(this.docs, this.editTargets()));
    return text;
  }

  /** Pastes `text` from the system clipboard (or the last copy) at the pointer, keeping its layout. */
  paste(text?: string): void {
    const clip = (text ? parseClipboard(text) : undefined) ?? this.clip;
    if (!clip || !this.isGm()) return;
    const offset = pasteOffsetTo(clip, this.pointer ?? this.viewCentre(), this.gridSize());
    this.sendOps('paste', pasteAt(this.docs, clip, { scene: this.scene, offset }).ops);
  }

  /** A copy of what is selected, one square over. */
  duplicate(): void {
    const clip = copyRefs(this.docs, this.isGm() ? this.editTargets() : []);
    const g = this.gridSize();
    this.sendOps('duplicate', pasteAt(this.docs, clip, { scene: this.scene, offset: [g, g] }).ops);
  }

  deleteSelected(): void {
    if (this.isGm()) this.sendOps('delete', deleteRefs(this.docs, this.editTargets()));
  }

  private sendOps(label: string, ops: Op[]): string | undefined {
    if (!ops.length) return undefined;
    const txn = `${label}-${++this.txns}`;
    this.send({ t: 'ops', txn, label, ops });
    return txn;
  }

  /**
   * Patches documents as this client has them, in one transaction, and shows
   * the result at once; a refusal puts them back.
   */
  protected sendUpdates(label: string, updates: readonly { ref: DocRef; patch: Patch }[]): void {
    const ops = updates.flatMap(({ ref, patch }): Op[] => {
      const doc = this.docs.get(ref.coll, ref.id);
      if (!doc || !Object.keys(patch).length) return [];
      return [{ op: 'update', coll: ref.coll, id: ref.id, rev: doc.rev, patch }];
    });
    this.sendChanges(label, ops);
  }

  /**
   * Sends a transaction of creates, updates and deletes and shows it at
   * once, as the server will leave the documents; a refusal puts them back.
   */
  protected sendChanges(label: string, ops: readonly Op[]): void {
    const shown = ops.map((op) => this.optimistic(op));
    const txn = this.sendOps(label, [...ops]);
    if (!txn) return;
    this.pending.set(txn, shown);
    this.docs.mirror(shown.map(({ coll, id, after }) => ({ coll, id, doc: after })));
    this.docsChanged();
  }

  /** A document before and after an op, as the server applies it. */
  private optimistic(op: Op): Shown {
    if (op.op === 'create') return { coll: op.coll, id: op.doc.id, after: { ...op.doc, rev: op.doc.rev + 1 } };
    const before = this.docs.get(op.coll, op.id);
    if (op.op === 'delete' || !before) return { coll: op.coll, id: op.id, before };
    // The server bumps the revision once per update, so a second edit before the echo still matches.
    return { coll: op.coll, id: op.id, before, after: { ...applyPatch(before, op.patch), rev: before.rev + 1 } };
  }

  /** A refused edit: put back what it changed, unless newer news came since. */
  private takeBack(txn: string): void {
    const shown = this.pending.get(txn) ?? [];
    this.pending.delete(txn);
    const current = shown.filter((s) => this.docs.get(s.coll, s.id)?.rev === s.after?.rev);
    if (!current.length) return;
    this.docs.mirror(current.map(({ coll, id, before }) => ({ coll, id, doc: before })));
    this.docsChanged();
  }

  /** Applies the edit messages; true when it was one of them. */
  protected applyEdit(msg: ServerMessage): boolean {
    switch (msg.t) {
      case 'docs':
        if (msg.txn) this.pending.delete(msg.txn);
        this.docs.mirror(msg.changes);
        this.docsChanged();
        return true;
      case 'reject':
        this.takeBack(msg.txn);
        this.showError(msg.reason);
        return true;
      case 'history': {
        const { t: _t, ...state } = msg;
        this.history = state;
        return true;
      }
      case 'undone':
        this.showNotice(`${msg.redo ? 'Redid' : 'Undid'} the ${msg.label}`);
        return true;
      default:
        return false;
    }
  }

  protected welcomeEdits(msg: Extract<ServerMessage, { t: 'welcome' }>): void {
    this.docs = new DocStore();
    this.pending.clear();
    for (const [coll, docs] of Object.entries(msg.docs ?? {}))
      this.docs.mirror(docs.map((doc) => ({ coll, id: doc.id, doc })));
    this.scene = msg.scene;
    this.history = msg.history;
  }
}

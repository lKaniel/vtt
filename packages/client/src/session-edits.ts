import {
  clipboardText,
  DocStore,
  parseClipboard,
  type Clip,
  type Doc,
  type DocRef,
  type Op,
  type Patch,
} from '@vtt/core';
import {
  applyPatch,
  copyRefs,
  deleteRefs,
  pasteAt,
  pasteOffsetTo,
  type HistoryState,
  type Point,
  type ServerMessage,
} from '@vtt/shared';
import { Commands } from './session-commands.ts';

// Copy, cut, paste, duplicate, delete, undo and redo, for every kind of
// document: the registry in shared (edit-kinds.ts) turns them into ops, the
// server checks and applies them, and keeps each user's undo history.

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
  private pending = new Map<string, { coll: string; id: string; doc: Doc }[]>();

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
    const before: { coll: string; id: string; doc: Doc }[] = [];
    const ops: Op[] = [];
    const after: { coll: string; id: string; doc: Doc }[] = [];
    for (const { ref, patch } of updates) {
      const doc = this.docs.get(ref.coll, ref.id);
      if (!doc || !Object.keys(patch).length) continue;
      ops.push({ op: 'update', coll: ref.coll, id: ref.id, rev: doc.rev, patch });
      before.push({ ...ref, doc });
      // The server bumps the revision once per update, so a second edit before the echo still matches.
      after.push({ ...ref, doc: { ...applyPatch(doc, patch), rev: doc.rev + 1 } });
    }
    const txn = this.sendOps(label, ops);
    if (!txn) return;
    this.pending.set(txn, before);
    this.docs.mirror(after);
    this.docsChanged();
  }

  /** A refused edit: put back what it changed, unless newer news came since. */
  private takeBack(txn: string): void {
    const before = this.pending.get(txn) ?? [];
    this.pending.delete(txn);
    const current = before.filter((b) => this.docs.get(b.coll, b.id)?.rev === b.doc.rev + 1);
    if (!current.length) return;
    this.docs.mirror(current);
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

import type { Doc, DocRef, Patch } from '@vtt/core';
import { dragHandle, type EditorMode, MODES, moveBy, type Point, type Rect, snapDelta } from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import { keyOf, refOf } from './editor/selection.ts';
import type { MenuItem } from './editor/menus.ts';
import type { LightPreset } from './map-tools.ts';
import type { ItemTool } from './editor/shape-tools.ts';
import { EditSession } from './session-edits.ts';

// The map editor's state: which mode and tool, what is selected, and the open
// context menu. Every change it makes goes out as document ops through
// EditSession, so undo, redo and the server's checks apply as for any edit.

/** What a press does in the current mode: select (and move, reshape), or draw. */
export type EditorTool = 'select' | 'tile' | 'wall' | 'door' | 'window' | 'place' | ItemTool;

/** A context menu on screen. */
export interface OpenMenu {
  /** Where it opens, in screen pixels. */
  screen: Point;
  items: MenuItem[];
}

export abstract class EditorSession extends EditSession {
  mode: EditorMode = 'tokens';
  tool: EditorTool = 'select';
  /** The light the place tool puts down. */
  lightPreset: LightPreset = 'torch';
  /** Keys ("<coll>#<id>") of what is selected in the current mode. */
  selection: string[] = [];
  menu?: OpenMenu;
  /** The part of the map on screen, kept up to date by the map. */
  viewRect?: Rect;

  /** The tokens this client knows, and which of them it may act with. */
  protected abstract knownTokens(): Iterable<TokenView>;
  abstract canControl(token: TokenView): boolean;
  /** The selection changed. */
  protected abstract selectionChanged(): void;
  /** The mode, tool or menu changed. */
  protected abstract editorChanged(): void;

  /** Where the camera starts on this scene. */
  protected abstract startPoint(): Point;

  /** The centre of the screen, where Compendium buttons and pastes without a pointer place things. */
  viewCentre(): Point {
    const r = this.viewRect;
    return r ? [r.x + r.w / 2, r.y + r.h / 2] : this.startPoint();
  }

  /** Visible creatures (tokens with stats) on screen: who joins a fight the GM starts. */
  fightersInView(): string[] {
    const r = this.viewRect;
    if (!r) return [];
    const inView = (t: TokenView) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h;
    const fighters = [...this.knownTokens()].filter((t) => (t.sheet ?? t.health) && !t.hidden && inView(t));
    return fighters.map((t) => t.id);
  }

  /** The collection the mode edits on this scene. */
  modeColl(mode: EditorMode = this.mode): string {
    return `${this.scene}/${MODES[mode].coll}`;
  }

  tokenKey(id: string): string {
    return keyOf({ coll: this.modeColl('tokens'), id });
  }

  /** True for a token in the editor's selection (the tokens mode). */
  isSelected(id: string): boolean {
    return this.mode === 'tokens' && this.selection.includes(this.tokenKey(id));
  }

  /** Whether this client may work in `mode` (players: tokens alone, unless a subclass says more). */
  protected mayUse(mode: string): boolean {
    return this.isGm() || mode === 'tokens';
  }

  /** Whether this seat may switch to `mode`. */
  canUseMode(mode: EditorMode): boolean {
    return this.mayUse(mode);
  }

  /** Changes mode (players only to those they may use), letting go of the selection. */
  setMode(mode: EditorMode, tool: EditorTool = 'select'): void {
    const next = this.mayUse(mode) ? mode : 'tokens';
    this.setSelection([]);
    this.mode = next;
    this.tool = next === 'tokens' ? 'select' : tool;
    this.menu = undefined;
    this.editorChanged();
  }

  setTool(tool: EditorTool): void {
    this.tool = tool;
    this.editorChanged();
  }

  setLightPreset(preset: LightPreset): void {
    this.lightPreset = preset;
    this.editorChanged();
  }

  setSelection(keys: string[]): void {
    this.selection = keys;
    this.selectionChanged();
  }

  /** Ctrl+A: everything in the mode (players: their own tokens). */
  selectAll(): void {
    if (this.mode !== 'tokens') {
      const coll = this.modeColl();
      this.setSelection(this.docs.all(coll).map((d) => keyOf({ coll, id: d.id })));
      return;
    }
    const mine = [...this.knownTokens()].filter((t) => this.canControl(t));
    this.setSelection(mine.map((t) => this.tokenKey(t.id)));
  }

  /** The selected documents, as this client has them. */
  selectedDocs(): { ref: DocRef; doc: Doc }[] {
    return this.selection.flatMap((key) => {
      const ref = refOf(key);
      const doc = this.docs.get(ref.coll, ref.id);
      return doc ? [{ ref, doc }] : [];
    });
  }

  /** Moves documents by `delta`, snapped as the mode snaps (Shift: free), in one step. */
  moveSelection(keys: readonly string[], delta: Point, free: boolean): void {
    const d = snapDelta(delta, this.mode, this.gridSize(), free);
    if (!d[0] && !d[1]) return;
    this.patchEach('move', keys, (doc) => moveBy(doc, d));
  }

  /** Arrow keys: one pixel, or one square with Shift. */
  nudge(dir: Point, big: boolean): void {
    const step = big ? this.gridSize() : 1;
    this.patchEach('move', this.selection, (doc) => moveBy(doc, [dir[0] * step, dir[1] * step]));
  }

  /** Drags one handle of a document (a wall end, a light ring, a tile edge) to `to`. */
  reshape(key: string, handle: string, to: Point, free: boolean): void {
    this.patchEach('reshape', [key], (doc) => dragHandle(doc, handle, to, { gridSize: this.gridSize(), free }));
  }

  /** Sets fields on each selected document, worked out from it (the inspector). */
  editEach(patchOf: (doc: Doc) => Patch, label = 'edit'): void {
    this.patchEach(label, this.selection, patchOf);
  }

  /** Sets fields on everything selected (the inspector, menus). */
  editSelection(patch: Patch, label = 'edit'): void {
    this.patchEach(label, this.selection, () => patch);
  }

  openMenu(screen: Point, items: MenuItem[]): void {
    this.menu = items.length ? { screen, items } : undefined;
    this.editorChanged();
  }

  closeMenu(): void {
    if (!this.menu) return;
    this.menu = undefined;
    this.editorChanged();
  }

  /** Drops keys that are gone from the selection. */
  protected pruneSelection(keep: (key: string) => boolean): void {
    const kept = this.selection.filter(keep);
    if (kept.length !== this.selection.length) this.setSelection(kept);
  }

  protected docsChanged(): void {
    if (this.mode !== 'tokens') this.pruneSelection((key) => !!this.docs.get(refOf(key).coll, refOf(key).id));
    this.editorChanged();
  }

  private patchEach(label: string, keys: readonly string[], patchOf: (doc: Doc) => Patch): void {
    const updates = keys.flatMap((key) => {
      const ref = refOf(key);
      const doc = this.docs.get(ref.coll, ref.id);
      return doc ? [{ ref, patch: patchOf(doc) }] : [];
    });
    this.sendUpdates(label, updates);
  }
}

import { type Doc, type DocStore, freeId, type Op } from '@vtt/core';
import { type EditorMode, ITEM_MODES, type Player } from '@vtt/shared';
import { signature } from './authorship.ts';
import type { Draft } from '../editor/shape-tools.ts';

// Drawings, notes, templates, regions and sounds made with the shape tools
// (editor/shape-tools.ts) and the look new ones get, as `session.draw`.
// Who may change what they make is authorship.ts.

/** How new drawings look. */
export interface ItemStyle {
  stroke: string;
  strokeWidth: number;
  fill?: string;
  fillAlpha?: number;
}

/** What the shape tools need of the session: documents, your seat, the scene and the editor. */
export interface DrawHost {
  readonly docs: DocStore;
  readonly you?: Player;
  readonly scene: string;
  readonly editor: { readonly mode: EditorMode; setSelection(keys: string[]): void };
  readonly edits: { sendChanges(label: string, ops: readonly Op[]): void };
}

/** What the drawing and level parts tell the session. */
export interface ToolEvents {
  /** A tool setting changed: the editor's tools redraw. */
  editorChanged(): void;
}

/** What the shape tools make, as `session.draw`. */
export class Draw {
  /** The look new drawings get. */
  style: ItemStyle = { stroke: '#ffffff', strokeWidth: 4 };

  constructor(
    private readonly s: DrawHost,
    private readonly on: ToolEvents,
  ) {}

  setStyle(style: Partial<ItemStyle>): void {
    this.style = { ...this.style, ...style };
    this.on.editorChanged();
  }

  /** Makes what a shape tool drew, in the look picked, and selects it. */
  create({ mode, data }: Draft): void {
    const { coll: name, type } = ITEM_MODES[mode];
    const coll = `${this.s.scene}/${name}`;
    const id = freeId(type, (x) => !!this.s.docs.get(coll, x));
    const doc = { id, type, rev: 0, ...this.lookOf(type), ...data, ...signature(this.s.you, type) } as Doc;
    this.s.edits.sendChanges('draw', [{ op: 'create', coll, doc }]);
    if (this.s.editor.mode === mode) this.s.editor.setSelection([`${coll}#${id}`]);
  }

  private lookOf(type: string): Record<string, unknown> {
    if (type === 'drawing') return { ...this.style };
    if (type === 'template') return { color: this.s.you?.color ?? '#ffcc00' };
    return {};
  }
}

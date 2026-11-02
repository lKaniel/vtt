import { type Doc, type DocStore, freeId, type Op } from '@vtt/core';
import { type EditorMode, ITEM_MODES, type Player, tokenLevel, type WorldInfo } from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import { signature } from './authorship.ts';
import type { Draft } from '../editor/shape-tools.ts';

// Drawings, notes, templates, regions and sounds made with the shape tools
// (editor/shape-tools.ts) and the look new ones get, as `session.draw`; and
// the scene level the map shows, as `session.levels`. Who may change what
// they make is authorship.ts.

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

/** What the levels need of the session: the world, the tokens and who you act with. */
export interface LevelHost {
  readonly world?: WorldInfo;
  readonly selected?: string;
  readonly tokens: ReadonlyMap<string, TokenView>;
  isGm(): boolean;
  canControl(token: TokenView): boolean;
}

/** The scene level the map shows, as `session.levels`. */
export class Levels {
  /** GM: the scene level picked to view and edit; none = every level. */
  view?: string;

  constructor(
    private readonly s: LevelHost,
    private readonly on: ToolEvents,
  ) {}

  /**
   * The level the map shows: the GM's pick, or for a player the level of the
   * token they act with (else their first). None on a scene without levels.
   */
  get current(): string | undefined {
    const levels = this.s.world?.levels;
    if (!levels?.length) return undefined;
    if (this.s.isGm()) return this.view;
    const acting = this.s.selected ? this.s.tokens.get(this.s.selected) : undefined;
    const eye = acting ?? [...this.s.tokens.values()].find((t) => this.s.canControl(t));
    return eye ? tokenLevel(levels, eye) : undefined;
  }

  setView(level: string | undefined): void {
    this.view = level;
    this.on.editorChanged();
  }
}

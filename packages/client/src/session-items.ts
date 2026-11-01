import { type Clip, type Doc, type DocRef, freeId } from '@vtt/core';
import { ITEM_MODES, type Player } from '@vtt/shared';
import type { Draft } from './editor/shape-tools.ts';
import { TileSession } from './session-tiles.ts';

// Drawings, notes, templates, regions and sounds made with the shape tools
// (editor/shape-tools.ts): the look new ones get, and what players may do.
// Players draw and place templates of their own: those carry their id as
// `author`, and they may copy, paste, change and delete only those.

/** How new drawings look. */
export interface ItemStyle {
  stroke: string;
  strokeWidth: number;
  fill?: string;
  fillAlpha?: number;
}

/** What players may make and change themselves. */
const AUTHORED = new Set(['drawing', 'template']);

export abstract class ItemSession extends TileSession {
  itemStyle: ItemStyle = { stroke: '#ffffff', strokeWidth: 4 };

  abstract you?: Player;

  setItemStyle(style: Partial<ItemStyle>): void {
    this.itemStyle = { ...this.itemStyle, ...style };
    this.editorChanged();
  }

  /** Makes what a shape tool drew, in the look picked, and selects it. */
  createItem({ mode, data }: Draft): void {
    const { coll: name, type } = ITEM_MODES[mode];
    const coll = `${this.scene}/${name}`;
    const id = freeId(type, (x) => !!this.docs.get(coll, x));
    const doc = { id, type, rev: 0, ...this.lookOf(type), ...data, ...this.signature(type) } as Doc;
    this.sendChanges('draw', [{ op: 'create', coll, doc }]);
    if (this.mode === mode) this.setSelection([`${coll}#${id}`]);
  }

  private lookOf(type: string): Record<string, unknown> {
    if (type === 'drawing') return { ...this.itemStyle };
    if (type === 'template') return { color: this.you?.color ?? '#ffcc00' };
    return {};
  }

  /** Players sign what they make. */
  private signature(type: string): Record<string, unknown> {
    return !this.isGm() && this.you && AUTHORED.has(type) ? { author: this.you.id } : {};
  }

  /** The GM edits anything; a player only drawings and templates of their own. */
  protected override mayEdit(refs: readonly DocRef[]): boolean {
    if (this.isGm()) return true;
    if (!refs.length || !this.you) return false;
    return refs.every((ref) => {
      const doc = this.docs.get(ref.coll, ref.id);
      return !!doc && AUTHORED.has(doc.type) && doc.author === this.you!.id;
    });
  }

  /** A player's paste: only drawings and templates, signed as theirs. */
  protected override pastable(clip: Clip): Clip | undefined {
    if (this.isGm()) return clip;
    const docs = clip.docs.filter((d) => AUTHORED.has(d.type)).map((d) => ({ ...d, author: this.you?.id }));
    return docs.length && this.you ? { docs } : undefined;
  }

  /** Whether a player may work in `mode` (the GM: any). */
  protected override mayUse(mode: string): boolean {
    return this.isGm() || mode === 'tokens' || mode === 'drawings' || mode === 'templates';
  }
}

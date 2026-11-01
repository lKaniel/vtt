import type { Doc } from '@vtt/core';
import { onLevel } from '@vtt/shared';
import { Container, Graphics, Text } from 'pixi.js';
import type { Session } from '../session.ts';
import { drawItem } from './item-draw.ts';

// Drawings, templates and map notes for everyone; regions and sounds for the
// GM, in their modes (players are sent regions they should see, which are
// drawn too). Text drawings and note labels are Pixi text, kept per item.

const ALWAYS = ['regions', 'templates', 'drawings', 'notes'] as const;
const LABEL_PX = 13;

export class ItemLayer {
  readonly container = new Container();
  private g = new Graphics();
  private texts = new Container();
  private zoom = 1;

  constructor(private session: Session) {
    this.container.addChild(this.g, this.texts);
    this.container.eventMode = 'none';
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.redraw();
  }

  /** The items to draw, bottom up: regions, templates, drawings, notes, then sounds (GM, in their mode). */
  private shown(): Doc[] {
    const s = this.session;
    const colls: string[] = [...ALWAYS];
    if (s.isGm() && s.mode === 'sounds') colls.push('sounds');
    const level = s.level;
    return colls.flatMap((c) => s.docs.all(`${s.scene}/${c}`)).filter((d) => onLevel(d as { level?: string }, level));
  }

  redraw(): void {
    const g = this.g.clear();
    for (const t of this.texts.removeChildren()) t.destroy();
    const ctx = { px: 1 / this.zoom, gridSize: this.session.world?.gridSize ?? 100 };
    for (const doc of this.shown()) {
      drawItem(g, doc, ctx);
      this.label(doc, ctx.px);
    }
  }

  /** A text drawing's text, or a note's label under its pin. */
  private label(doc: Doc, px: number): void {
    if (doc.type === 'drawing' && doc.shape === 'text') {
      const text = new Text({
        text: typeof doc.text === 'string' ? doc.text : '',
        style: {
          fill: (doc.textColor as string | undefined) ?? '#ffffff',
          fontSize: (doc.fontSize as number | undefined) ?? 32,
          wordWrap: true,
          wordWrapWidth: doc.w as number,
        },
      });
      text.position.set(doc.x as number, doc.y as number);
      this.texts.addChild(text);
    } else if (doc.type === 'note' && typeof doc.label === 'string') {
      const text = new Text({
        text: doc.label,
        style: { fill: '#f0d8a0', fontSize: LABEL_PX, stroke: { color: '#000000', width: 3 } },
      });
      text.scale.set(px);
      text.anchor.set(0.5, 0);
      text.position.set(doc.x as number, (doc.y as number) + 16 * px);
      this.texts.addChild(text);
    }
  }
}

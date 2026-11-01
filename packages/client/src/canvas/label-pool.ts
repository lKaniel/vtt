import type { Point } from '@vtt/shared';
import { type Container, Text, type TextStyleOptions } from 'pixi.js';

/** Text labels drawn afresh each frame, kept and reused rather than made anew. */
export class LabelPool {
  private texts: Text[] = [];
  private used = 0;
  private scale = 1;

  constructor(
    private container: Container,
    private style: TextStyleOptions,
  ) {}

  /** Starts a frame: every label is free again, drawn at `scale` (1 / zoom keeps them the same size on screen). */
  begin(scale: number): void {
    this.used = 0;
    this.scale = scale;
  }

  /** Shows `text` at `at`, `anchor`ed (0.5, 1: centred above it). */
  add(at: Point, text: string, fill: string | number, anchor: Point): void {
    const t = this.texts[this.used] ?? this.newText();
    this.used++;
    t.text = text;
    t.style.fill = fill;
    t.anchor.set(...anchor);
    t.position.set(at[0], at[1]);
    t.scale.set(this.scale);
  }

  /** Ends a frame: the labels not used in it are hidden. */
  end(): void {
    for (const [i, t] of this.texts.entries()) t.visible = i < this.used;
  }

  private newText(): Text {
    const t = new Text({ text: '', style: this.style });
    this.texts.push(t);
    this.container.addChild(t);
    return t;
  }
}

import { isGridless, measureRuler, type Point, type Region, regionCost } from '@vtt/shared';
import { Container, Graphics, Text } from 'pixi.js';
import { rulerLabels } from '../rulers.ts';
import type { Session } from '../session.ts';

const OUTLINE = 0x000000;
const TEXT_COLOR = 0xffffff;
const OVER_COLOR = 0xff8060;

/**
 * Every ruler on the scene: yours and the ones the others are laying, each
 * in its player's colour, with the feet so far at each waypoint and the
 * total (and what walking it costs) at the end. A ruler started on a
 * creature is measured against its speed, or what is left of its turn.
 */
export class RulerLayer {
  readonly container = new Container();
  private g = new Graphics();
  private texts: Text[] = [];
  private used = 0;
  private zoom = 1;

  constructor(private session: Session) {
    this.container.addChild(this.g);
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.redraw();
  }

  redraw(): void {
    this.g.clear();
    this.used = 0;
    const s = this.session;
    if (s.world) {
      for (const r of s.rulers.others.values()) this.drawRuler(r.points, r.color, r.name);
      this.drawRuler(s.rulers.mine, s.you?.color ?? '#ffffff');
    }
    for (const [i, t] of this.texts.entries()) t.visible = i < this.used;
  }

  private drawRuler(points: Point[], color: string, name?: string): void {
    if (points.length < 2) return;
    const world = this.session.world!;
    const regions = this.session.docs.all(`${this.session.scene}/regions`) as unknown as Region[];
    const m = measureRuler(points, {
      gridSize: world.gridSize,
      gridless: isGridless(world),
      cost: regionCost(regions, world.darkness),
    });
    this.drawLine(m.points, color);
    const labels = rulerLabels(m, this.limitFrom(m.points[0]!));
    for (const [i, l] of labels.entries()) {
      const last = i === labels.length - 1;
      this.label(l.at, last && name ? `${name}: ${l.text}` : l.text, l.over ? OVER_COLOR : TEXT_COLOR);
    }
  }

  private drawLine(points: Point[], color: string): void {
    const px = 1 / this.zoom;
    const g = this.g;
    for (const [width, c] of [
      [7 * px, OUTLINE],
      [3.5 * px, color],
    ] as const) {
      g.moveTo(...points[0]!);
      for (const p of points.slice(1)) g.lineTo(...p);
      g.stroke({ width, color: c, alpha: 0.9, cap: 'round', join: 'round' });
    }
    for (const p of points)
      g.circle(p[0], p[1], 6 * px)
        .fill({ color })
        .stroke({ width: 2 * px, color: OUTLINE });
  }

  /** The feet the creature standing at the ruler's start may walk: what's left of its turn, else its speed. */
  private limitFrom(start: Point): number | undefined {
    const s = this.session;
    for (const t of s.tokens.values()) {
      if (Math.hypot(t.x - start[0], t.y - start[1]) > 1) continue;
      const left = s.movementLeft(t.id);
      return Number.isFinite(left) ? left : t.speed;
    }
    return undefined;
  }

  private label(at: Point, text: string, fill: number): void {
    const t = this.texts[this.used] ?? this.newText();
    this.used++;
    t.text = text;
    t.style.fill = fill;
    t.position.set(at[0], at[1]);
    t.scale.set(1 / this.zoom);
  }

  private newText(): Text {
    const t = new Text({
      text: '',
      style: { fill: TEXT_COLOR, fontSize: 16, fontWeight: '600', stroke: { color: OUTLINE, width: 4 } },
    });
    t.anchor.set(0.5, 1.6);
    this.texts.push(t);
    this.container.addChild(t);
    return t;
  }
}

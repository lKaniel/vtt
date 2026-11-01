import type { Point } from '@vtt/shared';
import { Graphics } from 'pixi.js';
import type { Session } from '../session.ts';

/**
 * The GM's fog brush on the map: a ring under the pointer, and a stroke
 * collected while the button is down, sent as one edit when it is let go.
 */
export class FogBrush {
  readonly container = new Graphics();
  private stroke?: Point[];
  private hover?: Point;
  private zoom = 1;

  constructor(private session: Session) {
    this.container.eventMode = 'none';
    session.on('editor', () => this.draw());
  }

  get active(): boolean {
    return this.session.isGm() && !!this.session.fogBrush;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.draw();
  }

  /** A left press: true when the brush took it. */
  down(at: Point, button: number): boolean {
    if (!this.active || button !== 0) return false;
    this.stroke = [at];
    this.draw();
    return true;
  }

  move(at: Point): void {
    this.hover = at;
    const last = this.stroke?.at(-1);
    // A stamp every half radius keeps the stroke solid.
    if (last && Math.hypot(at[0] - last[0], at[1] - last[1]) >= this.session.fogBrushRadius() / 2) {
      this.stroke!.push(at);
    }
    this.draw();
  }

  /** Lets go: sends the stroke; true when there was one. */
  up(): boolean {
    const stroke = this.stroke;
    this.stroke = undefined;
    if (stroke) this.session.brushFog(stroke);
    this.draw();
    return !!stroke;
  }

  draw(): void {
    const g = this.container.clear();
    if (!this.active) return;
    const r = this.session.fogBrushRadius();
    const color = this.session.fogBrush === 'reveal' ? 0xfff2c0 : 0x4060a0;
    for (const p of this.stroke ?? []) g.circle(p[0], p[1], r).fill({ color, alpha: 0.18 });
    if (this.hover) g.circle(this.hover[0], this.hover[1], r).stroke({ width: 2 / this.zoom, color, alpha: 0.9 });
  }
}

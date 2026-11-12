import type { Point } from '@vtt/shared';
import { Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { assetUrl } from '../assets.ts';
import { BLANK, scatterPoints, type StampDoc } from '../editor/stamp.ts';
import type { Session } from '../session/session.ts';
import { MODEL_COLOR } from './editor-draw.ts';

/**
 * The stamp brush on the map (the tiles mode's Stamp tool, editor/stamp.ts):
 * a see-through ghost of the picture (or the box of the 3D model) under the
 * pointer; a click puts one down, a drag scatters them along its way, all
 * sent as one edit when the button comes up. Shift: no snapping.
 */
export class StampBrush {
  readonly container = new Container();
  private g = new Graphics();
  private ghost = new Sprite();
  private textures = new Map<string, Texture | 'loading'>();
  private stroke?: Point[];
  private hover?: Point;
  private free = false;
  private zoom = 1;

  constructor(private session: Session) {
    this.container.eventMode = 'none';
    this.ghost.anchor.set(0.5);
    this.ghost.alpha = 0.6;
    this.container.addChild(this.ghost, this.g);
    session.on('editor', () => this.draw());
  }

  get active(): boolean {
    return this.session.isGm() && this.session.editor.stamp.armed;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.draw();
  }

  /** A left press: true when the brush took it. */
  down(at: Point, button: number, shift: boolean): boolean {
    if (!this.active || button !== 0) return false;
    this.stroke = [at];
    this.free = shift;
    this.draw();
    return true;
  }

  move(at: Point, shift: boolean): void {
    this.hover = at;
    this.free = shift;
    this.stroke?.push(at);
    if (this.active || this.stroke) this.draw();
  }

  /** Lets go: stamps once for a click, along the way for a drag; true when the brush had the press. */
  up(): boolean {
    const spots = this.spots();
    this.stroke = undefined;
    if (spots) this.session.editor.stamp.place(spots, this.free);
    this.draw();
    return !!spots;
  }

  /** A right click: the brush is put down (the select tool); true if it was in hand. */
  putDown(): boolean {
    if (!this.active) return false;
    this.stroke = undefined;
    this.session.editor.setTool('select');
    return true;
  }

  /** Where the press so far stamps: its start for a click, a spot every spacing for a drag. */
  private spots(): Point[] | undefined {
    const stroke = this.stroke;
    if (!stroke) return undefined;
    const start = stroke[0]!;
    const far = stroke.some((p) => Math.hypot(p[0] - start[0], p[1] - start[1]) > 6 / this.zoom);
    return far ? scatterPoints(stroke, this.session.editor.stamp.spacing()) : [start];
  }

  draw(): void {
    const g = this.g.clear();
    this.ghost.visible = false;
    if (!this.active || !this.hover) return;
    const stamp = this.session.editor.stamp;
    const spots = this.stroke && this.spots();
    if (spots && spots.length > 1) {
      for (const at of spots) this.outline(g, stamp.preview(at, true));
      return;
    }
    const doc = stamp.preview(this.stroke?.[0] ?? this.hover, this.free);
    if (!doc) return;
    // A model shows its plan (once drawn) inside its box; a picture shows itself.
    if (doc.src !== BLANK) this.picture(doc);
    if (doc.model) this.outline(g, doc, doc.src === BLANK);
  }

  /** A model's box (turned as it will stand, with its front marked), or where a scattered stamp lands. */
  private outline(g: Graphics, doc: StampDoc | undefined, filled = false): void {
    if (!doc) return;
    const turn = ((doc.model?.rotation ?? doc.rotation ?? 0) * Math.PI) / 180;
    const [cx, cy] = [doc.x + doc.w / 2, doc.y + doc.h / 2];
    const at = (dx: number, dy: number): Point => [
      cx + dx * Math.cos(turn) - dy * Math.sin(turn),
      cy + dx * Math.sin(turn) + dy * Math.cos(turn),
    ];
    const [hw, hh] = [doc.w / 2, doc.h / 2];
    const corners = [at(-hw, -hh), at(hw, -hh), at(hw, hh), at(-hw, hh)].flat();
    g.poly(corners).stroke({ width: 2 / this.zoom, color: MODEL_COLOR, alpha: 0.9 });
    if (filled) g.poly(corners).fill({ color: MODEL_COLOR, alpha: 0.18 });
    // The model's front: an arrow from the middle to the bottom edge, which faces the map's south unturned.
    g.moveTo(...at(0, 0))
      .lineTo(...at(0, hh))
      .stroke({ width: 2 / this.zoom, color: MODEL_COLOR, alpha: 0.9 });
  }

  private picture(doc: StampDoc): void {
    const texture = this.texture(doc.src);
    if (!texture) return this.outline(this.g, doc);
    const s = this.ghost;
    s.texture = texture;
    s.position.set(doc.x + doc.w / 2, doc.y + doc.h / 2);
    s.width = doc.w;
    s.height = doc.h;
    s.rotation = ((doc.rotation ?? 0) * Math.PI) / 180;
    s.visible = true;
  }

  /** The picture's texture, once loaded (the ghost shows its box until then). */
  private texture(src: string): Texture | undefined {
    const known = this.textures.get(src);
    if (known === 'loading') return undefined;
    if (known) return known;
    this.textures.set(src, 'loading');
    Assets.load<Texture>(assetUrl(src)).then(
      (t) => {
        this.textures.set(src, t);
        this.draw();
      },
      () => undefined,
    );
    return undefined;
  }
}

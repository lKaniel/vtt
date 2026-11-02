import { type Point, rectBetween } from '@vtt/shared';
import type { Graphics } from 'pixi.js';
import { isItemTool, ShapeDraft } from '../editor/shape-tools.ts';
import { LIGHT_PRESETS, snapPoint, wallEdit } from '../map-tools.ts';
import type { Session } from '../session.ts';
import { DOOR_COLOR, WALL_COLOR, type DrawCtx } from './editor-draw.ts';
import { drawDraft } from './item-draw.ts';

/**
 * The drawing tools of the tiles, walls and lights modes, and the shape tools of the rest: drag a box to draw
 * a tile, click corner to corner to draw walls, doors and windows (they chain
 * on; a door is one piece), or click to place a light. Shift turns snapping off.
 */
export class DrawTools {
  /** Where the wall being drawn starts. */
  private chain?: Point;
  /** Where the tile being drawn starts. */
  private box?: Point;
  /** The shape tool in use (drawings, notes, templates, regions, sounds). */
  private draft?: ShapeDraft;

  constructor(private session: Session) {}

  get drawing(): boolean {
    const tool = this.session.tool;
    return this.session.mode !== 'tokens' && tool !== 'select' && tool !== 'ruler';
  }

  /** A wall, tile or shape is half drawn. */
  get busy(): boolean {
    return !!this.chain || !!this.box || !!this.draft?.busy;
  }

  cancel(): void {
    this.chain = undefined;
    this.box = undefined;
    this.draft?.cancel();
  }

  /** Ends a line, polygon or region being drawn (a right click); true if it did. */
  finish(): boolean {
    const done = this.draft?.busy ? this.draft.finish() : undefined;
    if (done) this.session.createItem(done);
    return !!done;
  }

  /** The shape tool for the current tool, made afresh when the tool changes. */
  private shapes(): ShapeDraft | undefined {
    const tool = this.session.tool;
    if (!isItemTool(tool)) return undefined;
    if (this.draft?.tool !== tool) this.draft = new ShapeDraft(tool);
    return this.draft;
  }

  private snap(free: boolean) {
    return { gridSize: this.grid, free };
  }

  /** The pointer moved with the button down. */
  drag(at: Point): void {
    this.draft?.drag(at);
  }

  press(at: Point, free: boolean): void {
    const shapes = this.shapes();
    if (shapes) {
      const done = shapes.press(at, this.snap(free));
      if (done) this.session.createItem(done);
      return;
    }
    const tool = this.session.tool;
    if (tool === 'tile') {
      this.box = snapPoint(at, this.grid, !free);
      return;
    }
    if (tool === 'place') return this.placeLight(at, free);
    if (tool === 'wall' || tool === 'door' || tool === 'window') this.pressWall(tool, at, free);
  }

  /** The end of a drag: a tile tool draws its tile. */
  release(at: Point, free: boolean): void {
    const shapes = this.shapes();
    if (shapes) {
      const done = shapes.release(at, this.snap(free));
      if (done) this.session.createItem(done);
      return;
    }
    const start = this.box;
    this.box = undefined;
    if (!start) return;
    const r = rectBetween(start, snapPoint(at, this.grid, !free));
    if (r.w > 0 && r.h > 0) this.session.createTile(r);
  }

  draw(g: Graphics, hover: Point | undefined, free: boolean, ctx: DrawCtx): void {
    const tool = this.session.tool;
    if (!hover || !this.drawing) return;
    const shapes = this.shapes();
    if (shapes) return drawDraft(g, { data: shapes.preview(hover, this.snap(free)), tool: shapes.tool, hover }, ctx);
    const { px } = ctx;
    if (tool === 'tile') {
      const at = snapPoint(hover, this.grid, !free);
      g.circle(at[0], at[1], 5 * px).fill({ color: 0xffffff, alpha: 0.9 });
      if (this.box) {
        const r = rectBetween(this.box, at);
        g.rect(r.x, r.y, r.w, r.h).stroke({ width: 2 * px, color: 0xffe08a, alpha: 0.9 });
      }
      return;
    }
    if (tool === 'place') {
      const at = this.lightSpot(hover, free);
      g.circle(at[0], at[1], 7 * px).stroke({ width: 2 * px, color: 0xffffff, alpha: 0.8 });
      return;
    }
    const at = snapPoint(hover, this.grid, !free);
    g.circle(at[0], at[1], 6 * px).fill({ color: 0xffffff, alpha: 0.9 });
    if (this.chain)
      g.moveTo(...this.chain)
        .lineTo(...at)
        .stroke({ width: 4 * px, color: tool === 'door' ? DOOR_COLOR : WALL_COLOR, alpha: 0.8 });
  }

  private get grid(): number {
    return this.session.world?.gridSize ?? 100;
  }

  /** Lights snap to square corners and centres. */
  private lightSpot(at: Point, free: boolean): Point {
    return snapPoint(at, free ? 1 : this.grid / 2, true);
  }

  private placeLight(at: Point, free: boolean): void {
    const { label: _label, ...light } = LIGHT_PRESETS[this.session.lightPreset];
    const [x, y] = this.lightSpot(at, free);
    this.session.editMap({ op: 'addLight', light: { ...light, x, y } });
  }

  private pressWall(tool: 'wall' | 'door' | 'window', p: Point, free: boolean): void {
    const at = snapPoint(p, this.grid, !free);
    const from = this.chain;
    if (!from) {
      this.chain = at;
      return;
    }
    if (from[0] === at[0] && from[1] === at[1]) return;
    this.session.editMap(wallEdit(tool, from, at));
    this.chain = tool === 'door' ? undefined : at;
  }
}

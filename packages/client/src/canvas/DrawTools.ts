import type { Point } from '@vtt/shared';
import type { Graphics } from 'pixi.js';
import { LIGHT_PRESETS, snapPoint, wallEdit } from '../map-tools.ts';
import type { Session } from '../session.ts';
import { DOOR_COLOR, WALL_COLOR, type DrawCtx } from './editor-draw.ts';

/**
 * The drawing tools of the walls and lights modes: click corner to corner to
 * draw walls, doors and windows (they chain on; a door is one piece), or
 * click to place a light. Shift turns snapping off.
 */
export class DrawTools {
  /** Where the wall being drawn starts. */
  private chain?: Point;

  constructor(private session: Session) {}

  get drawing(): boolean {
    return this.session.mode !== 'tokens' && this.session.tool !== 'select';
  }

  /** A wall is half drawn. */
  get busy(): boolean {
    return !!this.chain;
  }

  cancel(): void {
    this.chain = undefined;
  }

  press(at: Point, free: boolean): void {
    const tool = this.session.tool;
    if (tool === 'place') return this.placeLight(at, free);
    if (tool === 'wall' || tool === 'door' || tool === 'window') this.pressWall(tool, at, free);
  }

  draw(g: Graphics, hover: Point | undefined, free: boolean, ctx: DrawCtx): void {
    const tool = this.session.tool;
    if (!hover || !this.drawing) return;
    const { px } = ctx;
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

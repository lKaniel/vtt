import { feetToPx, type Point, type Wall } from '@vtt/shared';
import { Container, Graphics } from 'pixi.js';
import { LIGHT_PRESETS, pickAt, snapPoint, wallEdit, type Picked } from '../map-tools.ts';
import type { Session } from '../session.ts';
import { lightColor } from './lighting/light-style.ts';

/** How close (screen pixels) the pointer must be to pick a wall or light. */
const PICK_PX = 14;
const WALL_COLOR = 0x6fd0ff;
const DOOR_COLOR = 0xffb050;
const WINDOW_COLOR = 0xa0f0ff;
const ERASE_COLOR = 0xff5a4a;

export interface PointerInfo {
  at: Point;
  button: number;
  /** Shift turns off snapping to the grid. */
  free: boolean;
}

/**
 * The GM's map tools on the canvas: click corner to corner to draw walls,
 * doors and windows; click to place a light or drag one to move it; click a
 * wall or light to erase it. Draws walls, lights and previews above the map
 * while a tool is in use.
 */
export class MapEditor {
  readonly container = new Container();
  private g = new Graphics();
  /** Where the wall being drawn starts. */
  private chain?: Point;
  private hover?: Point;
  private free = false;
  private dragging?: Picked;
  private zoom = 1;

  constructor(private session: Session) {
    this.container.addChild(this.g);
    this.container.eventMode = 'none';
  }

  get active(): boolean {
    return !!this.session.mapTool;
  }

  /** Put away a half-drawn wall or a dragged light. */
  cancel(): void {
    this.chain = this.dragging = undefined;
    this.redraw();
  }

  /** True when the tool used the press; otherwise the map pans as usual. */
  pointerDown(p: PointerInfo): boolean {
    const tool = this.session.mapTool;
    if (!tool) return false;
    if (p.button === 2) {
      const had = !!(this.chain ?? this.dragging);
      this.cancel();
      return had;
    }
    if (p.button !== 0) return false;
    if (tool === 'erase') this.erase(p.at);
    else if (tool === 'light') this.pressLight(p);
    else this.pressWall(tool, p);
    this.redraw();
    return true;
  }

  pointerMove(at: Point, free: boolean): void {
    if (!this.active) return;
    this.hover = at;
    this.free = free;
    this.redraw();
  }

  pointerUp(p: PointerInfo): void {
    const picked = this.dragging;
    this.dragging = undefined;
    if (!picked || p.button !== 0) return;
    const to = this.lightSpot(p);
    if (Math.hypot(to[0] - picked.at[0], to[1] - picked.at[1]) > 1)
      this.session.editMap({ op: 'moveLight', chunk: picked.chunk, id: picked.id, to });
    this.redraw();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.redraw();
  }

  private get grid(): number {
    return this.session.world?.gridSize ?? 100;
  }

  private pick(at: Point): Picked | undefined {
    return pickAt(this.session.chunks, at, PICK_PX / this.zoom);
  }

  private erase(at: Point): void {
    const picked = this.pick(at);
    if (picked) this.session.editMap({ op: 'remove', chunk: picked.chunk, id: picked.id });
  }

  /** Lights snap to square corners and centres; shift places them anywhere. */
  private lightSpot(p: { at: Point; free: boolean }): Point {
    return snapPoint(p.at, p.free ? 1 : this.grid / 2, true);
  }

  private pressLight(p: PointerInfo): void {
    const picked = this.pick(p.at);
    if (picked?.kind === 'light') {
      this.dragging = picked;
      return;
    }
    const { label: _label, ...light } = LIGHT_PRESETS[this.session.lightPreset];
    const [x, y] = this.lightSpot(p);
    this.session.editMap({ op: 'addLight', light: { ...light, x, y } });
  }

  private pressWall(tool: 'wall' | 'door' | 'window', p: PointerInfo): void {
    const at = snapPoint(p.at, this.grid, !p.free);
    const from = this.chain;
    if (!from) {
      this.chain = at;
      return;
    }
    if (from[0] === at[0] && from[1] === at[1]) return;
    this.session.editMap(wallEdit(tool, from, at));
    // Walls chain on from where the last one ended; a door is one piece.
    this.chain = tool === 'door' ? undefined : at;
  }

  // Drawing ------------------------------------------------------------------

  redraw(): void {
    const g = this.g.clear();
    if (!this.active) return;
    const px = 1 / this.zoom;
    this.drawWalls(g, px);
    this.drawLights(g, px);
    this.drawHover(g, px);
  }

  private drawWalls(g: Graphics, px: number): void {
    for (const c of this.session.chunks.values()) {
      for (const w of c.walls) {
        const color = wallColor(w);
        g.moveTo(...w.a)
          .lineTo(...w.b)
          .stroke({ width: 3 * px, color, alpha: 0.9 });
        for (const end of [w.a, w.b]) g.circle(end[0], end[1], 4 * px).fill(color);
      }
    }
  }

  private drawLights(g: Graphics, px: number): void {
    for (const c of this.session.chunks.values()) {
      for (const l of c.lights) {
        const color = l.darkness ? 0x3a2a5a : lightColor(l);
        const reach = feetToPx(l.bright + l.dim, this.grid);
        g.circle(l.x, l.y, reach).stroke({ width: 1.5 * px, color, alpha: 0.5 });
        g.circle(l.x, l.y, 11 * px)
          .fill({ color: 0x15120f, alpha: 0.85 })
          .stroke({ width: 2 * px, color });
        g.circle(l.x, l.y, 5 * px).fill(color);
      }
    }
  }

  private drawHover(g: Graphics, px: number): void {
    const hover = this.hover;
    const tool = this.session.mapTool;
    if (!hover || !tool) return;
    if (tool === 'erase') {
      const picked = this.pick(hover);
      if (picked) g.circle(picked.at[0], picked.at[1], 12 * px).stroke({ width: 3 * px, color: ERASE_COLOR });
      return;
    }
    if (tool === 'light') {
      const at = this.lightSpot({ at: hover, free: this.free });
      g.circle(at[0], at[1], 7 * px).stroke({ width: 2 * px, color: 0xffffff, alpha: 0.8 });
      return;
    }
    const at = snapPoint(hover, this.grid, !this.free);
    g.circle(at[0], at[1], 6 * px).fill({ color: 0xffffff, alpha: 0.9 });
    if (this.chain)
      g.moveTo(...this.chain)
        .lineTo(...at)
        .stroke({ width: 4 * px, color: tool === 'door' ? DOOR_COLOR : WALL_COLOR, alpha: 0.8 });
  }
}

function wallColor(w: Wall): number {
  if (w.door) return DOOR_COLOR;
  return w.sight === false ? WINDOW_COLOR : WALL_COLOR;
}

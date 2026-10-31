import { findPath, snapToGrid, type Point, type Token, type Wall } from '@vtt/shared';
import { Container, Graphics, Text } from 'pixi.js';

const OK_COLOR = 0xffffff;
const TOO_FAR_COLOR = 0xff8060;
const BLOCKED_COLOR = 0xd04a4a;

/** The path a selected token would walk to the hovered square, with its length in feet. */
export class PathPreview {
  readonly container = new Container();
  private line = new Graphics();
  private label = new Text({
    text: '',
    style: { fill: OK_COLOR, fontSize: 28, fontWeight: '600', stroke: { color: 0x000000, width: 5 } },
  });
  private shownFor?: string;

  constructor() {
    this.label.anchor.set(0.5, 1.4);
    this.container.addChild(this.line, this.label);
  }

  clear(): void {
    this.line.clear();
    this.label.text = '';
    this.shownFor = undefined;
  }

  /** Redraws unless the token and the hovered square are unchanged (or `force`). */
  show(
    token: Token,
    hover: Point,
    ctx: { gridSize: number; walls: readonly Wall[]; zoom: number; force: boolean },
  ): void {
    const g = ctx.gridSize;
    const target = snapToGrid(hover, g);
    const key = `${target[0]},${target[1]}:${token.x},${token.y}`;
    if (!ctx.force && key === this.shownFor) return;
    this.clear();
    this.shownFor = key;
    const path = findPath([token.x, token.y], target, ctx.walls, { gridSize: g });
    if (!path) {
      this.line.circle(target[0], target[1], g * 0.3).stroke({ width: 6, color: BLOCKED_COLOR });
      return;
    }
    if (path.points.length < 2) return;
    const color = path.feet > token.speed ? TOO_FAR_COLOR : OK_COLOR;
    this.drawRoute(path.points, color, g);
    this.label.text = `${path.feet} ft`;
    this.label.style.fill = color;
    this.label.position.set(target[0], target[1] - g * 0.3);
    this.label.scale.set(Math.max(1, 0.8 / ctx.zoom));
  }

  private drawRoute(points: Point[], color: number, g: number): void {
    const l = this.line;
    l.moveTo(...points[0]!);
    for (const p of points.slice(1)) l.lineTo(...p);
    l.stroke({ width: 6, color, alpha: 0.8, cap: 'round', join: 'round' });
    for (const p of points.slice(1, -1)) l.circle(p[0], p[1], 6).fill({ color, alpha: 0.8 });
    const end = points.at(-1)!;
    l.circle(end[0], end[1], g * 0.3).stroke({ width: 6, color });
  }
}

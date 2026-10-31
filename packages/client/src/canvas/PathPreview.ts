import {
  attackRange,
  findPath,
  hasLineOfSight,
  snapToGrid,
  tokenDistance,
  type Attack,
  type Point,
  type Token,
  type Wall,
} from '@vtt/shared';
import { Container, Graphics, Text } from 'pixi.js';

const OK_COLOR = 0xffffff;
const TOO_FAR_COLOR = 0xff8060;
const BLOCKED_COLOR = 0xd04a4a;
const LONG_RANGE_COLOR = 0xf0c040;

interface PreviewContext {
  gridSize: number;
  walls: readonly Wall[];
  zoom: number;
  force: boolean;
}

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
  show(token: Token, hover: Point, ctx: PreviewContext & { budget: number }): void {
    const g = ctx.gridSize;
    const target = snapToGrid(hover, g);
    if (!this.needsRedraw(`walk:${target[0]},${target[1]}:${token.x},${token.y}`, ctx.force)) return;
    const path = findPath([token.x, token.y], target, ctx.walls, { gridSize: g });
    if (!path) {
      this.line.circle(target[0], target[1], g * 0.3).stroke({ width: 6, color: BLOCKED_COLOR });
      return;
    }
    if (path.points.length < 2) return;
    // In a fight the limit is what's left of this turn's movement.
    const limit = Number.isFinite(ctx.budget) ? ctx.budget : token.speed;
    const color = path.feet > limit ? TOO_FAR_COLOR : OK_COLOR;
    this.drawRoute(path.points, color, g);
    this.setLabel(Number.isFinite(ctx.budget) ? `${path.feet} / ${ctx.budget} ft` : `${path.feet} ft`, color);
    this.placeLabel(target, ctx);
  }

  /** A line from the attacker to the hovered square, saying whether it's in range. */
  showAttack(token: Token, hover: Point, attack: Attack, ctx: PreviewContext): void {
    const target = snapToGrid(hover, ctx.gridSize);
    if (!this.needsRedraw(`attack:${attack.name}:${target[0]},${target[1]}:${token.x},${token.y}`, ctx.force)) return;
    const feet = tokenDistance(token, { x: target[0], y: target[1], size: 1 }, ctx.gridSize);
    const blocked = !hasLineOfSight([token.x, token.y], target, ctx.walls);
    const range = blocked ? 'out' : attackRange(attack, feet);
    const color = { normal: OK_COLOR, long: LONG_RANGE_COLOR, out: BLOCKED_COLOR }[range];
    this.line.moveTo(token.x, token.y).lineTo(...target);
    this.line.stroke({ width: 4, color, alpha: 0.8 });
    this.line.circle(target[0], target[1], ctx.gridSize * 0.4).stroke({ width: 6, color });
    const note = { normal: '', long: ' · disadvantage', out: blocked ? ' · no clear shot' : ' · out of range' }[range];
    this.setLabel(`${attack.name} · ${feet} ft${note}`, color);
    this.placeLabel(target, ctx);
  }

  private needsRedraw(key: string, force: boolean): boolean {
    if (!force && key === this.shownFor) return false;
    this.clear();
    this.shownFor = key;
    return true;
  }

  private setLabel(text: string, color: number): void {
    this.label.text = text;
    this.label.style.fill = color;
  }

  private placeLabel(target: Point, ctx: PreviewContext): void {
    this.label.position.set(target[0], target[1] - ctx.gridSize * 0.3);
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

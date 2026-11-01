import { areaShape, type Attack, attackRange, type Token, tokenDistance } from '@vtt/system-dnd5e';
import {
  hasLineOfSight,
  isGridless,
  type Point,
  type Region,
  regionCost,
  type WalkOptions,
  walkPath,
  type Wall,
} from '@vtt/shared';
import { Container, Graphics, Text } from 'pixi.js';
import { previewLabel } from '../spell-text.ts';
import type { Session } from '../session.ts';
import { aimPoint, walkOptions } from '../walking.ts';
import { needsClearPath, type Aiming } from '../targeting.ts';

const OK_COLOR = 0xffffff;
const TOO_FAR_COLOR = 0xff8060;
const BLOCKED_COLOR = 0xd04a4a;
const LONG_RANGE_COLOR = 0xf0c040;
const AREA_COLOR = 0xff9040;

interface PreviewContext {
  gridSize: number;
  /** No grid: aim at the very point and measure as the crow flies. */
  gridless: boolean;
  walls: readonly Wall[];
  zoom: number;
  force: boolean;
  /** What a step through each point costs (difficult ground the player knows of). */
  cost?: (p: Point) => number;
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
  show(token: Token, hover: Point, ctx: PreviewContext & { budget: number; walk: WalkOptions }): void {
    const g = ctx.gridSize;
    const target = this.aim(hover, ctx);
    if (!this.needsRedraw(`walk:${target[0]},${target[1]}:${token.x},${token.y}`, ctx.force)) return;
    const path = walkPath([token.x, token.y], target, ctx.walls, { ...ctx.walk, cost: ctx.cost });
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
    const target = this.aim(hover, ctx);
    if (!this.needsRedraw(`attack:${attack.name}:${target[0]},${target[1]}:${token.x},${token.y}`, ctx.force)) return;
    const feet = tokenDistance(token, { x: target[0], y: target[1], size: 1 }, ctx.gridSize, ctx.gridless);
    const blocked = !hasLineOfSight([token.x, token.y], target, ctx.walls, { kind: 'sight', gridSize: ctx.gridSize });
    const range = blocked ? 'out' : attackRange(attack, feet);
    const color = { normal: OK_COLOR, long: LONG_RANGE_COLOR, out: BLOCKED_COLOR }[range];
    this.line.moveTo(token.x, token.y).lineTo(...target);
    this.line.stroke({ width: 4, color, alpha: 0.8 });
    this.line.circle(target[0], target[1], ctx.gridSize * 0.4).stroke({ width: 6, color });
    const note = { normal: '', long: ' · disadvantage', out: blocked ? ' · no clear shot' : ' · out of range' }[range];
    this.setLabel(`${attack.name} · ${feet} ft${note}`, color);
    this.placeLabel(target, ctx);
  }

  /** Where the aimed spell would land: its area, or a line to the hovered creature or point, and whether it's in range. */
  showSpell(token: Token, hover: Point, aiming: Aiming, ctx: PreviewContext): void {
    const { spell } = aiming;
    const target = this.aim(hover, ctx);
    const key = `spell:${spell.id}:${aiming.picks.length}:${target[0]},${target[1]}:${token.x},${token.y}`;
    if (!this.needsRedraw(key, ctx.force)) return;
    const reach = spell.teleport ?? spell.range;
    const feet = Math.round((Math.hypot(target[0] - token.x, target[1] - token.y) / ctx.gridSize) * 5);
    const blocked =
      needsClearPath(spell) &&
      !hasLineOfSight([token.x, token.y], target, ctx.walls, { kind: 'sight', gridSize: ctx.gridSize });
    const out = (reach > 0 && feet > Math.max(5, reach) + 2.5) || blocked;
    const color = out ? BLOCKED_COLOR : OK_COLOR;
    const count = aiming.mode === 'creatures' ? `${aiming.picks.length + 1}/${aiming.need}` : undefined;
    if (spell.area) {
      this.drawArea(
        areaShape({ area: spell.area, range: spell.range }, { caster: token, aim: hover, gridSize: ctx.gridSize }),
      );
    } else {
      this.line
        .moveTo(token.x, token.y)
        .lineTo(...target)
        .stroke({ width: 4, color, alpha: 0.8 });
      this.line.circle(target[0], target[1], ctx.gridSize * 0.4).stroke({ width: 6, color });
    }
    this.setLabel(previewLabel({ name: spell.name, count, feet, reach, blocked }), color);
    this.placeLabel(target, ctx);
  }

  private drawArea(shape: ReturnType<typeof areaShape>): void {
    if (shape.kind === 'circle') this.line.circle(shape.center[0], shape.center[1], shape.radius);
    else this.line.poly(shape.points.flat());
    this.line.fill({ color: AREA_COLOR, alpha: 0.25 }).stroke({ width: 4, color: AREA_COLOR, alpha: 0.9 });
  }

  /** The hovered point, whole pixels without a grid, its square's centre on one. */
  private aim(hover: Point, ctx: PreviewContext): Point {
    const [x, y] = aimPoint(hover, { gridSize: ctx.gridSize, grid: ctx.gridless ? 'none' : 'square' });
    return [Math.round(x), Math.round(y)];
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

/** Shows what the selected token would do at `hover`: cast the spell it aims, attack, or walk (round difficult ground the player knows of). */
export function showPreview(
  preview: PathPreview,
  session: Session,
  at: {
    token: Token & { sheet?: { attacks: Attack[] } };
    hover: Point;
    walls: readonly Wall[];
    zoom: number;
    force: boolean;
  },
): void {
  const world = session.world;
  if (!world) return preview.clear();
  const { token, hover } = at;
  const regions = session.docs.all(`${session.scene}/regions`) as unknown as Region[];
  const ctx = {
    gridSize: world.gridSize,
    gridless: isGridless(world),
    walls: at.walls,
    zoom: at.zoom,
    force: at.force,
    cost: regionCost(regions, world.darkness),
  };
  const attack = token.sheet?.attacks.find((a) => a.name === session.armed);
  if (session.aiming) preview.showSpell(token, hover, session.aiming, ctx);
  else if (attack) preview.showAttack(token, hover, attack, ctx);
  else {
    const walk = walkOptions(world, token, session.tokens.values());
    preview.show(token, hover, { ...ctx, budget: session.movementLeft(token.id), walk });
  }
}

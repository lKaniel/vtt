import {
  areaCells,
  areaShape,
  type Attack,
  attackRange,
  type Token,
  tokenDistance,
  type TokenView,
} from '@vtt/system-dnd5e';
import {
  bodyOf,
  hasLineOfSight,
  gridKind,
  type GridKind,
  latticeOf,
  type Point,
  type Region,
  regionCost,
  type WalkOptions,
  walkPath,
  type Wall,
  wallsOnFloor,
} from '@vtt/shared';
import { Container, Graphics, Text } from 'pixi.js';
import { fillCells } from './item-draw.ts';
import { Sketch } from './sketch.ts';
import { previewLabel } from '../text/spell-text.ts';
import type { Session } from '../session/session.ts';
import { aimPoint, walkOptions } from '../play/walking.ts';
import { needsClearPath, type Aiming } from '../play/targeting.ts';
import { type WalkPlan, type WalkWarning, walkWarnings } from '../play/walk-warnings.ts';
import { t } from '../i18n/index.ts';
import { snapFor } from '../play/interact.ts';
import { interactSpot, type Snap } from '../play/snapping.ts';
import { hoverAim, rangePlan } from '../play/walk-in-range.ts';

/** What the walk preview needs besides the scene: who and what the player knows of, and the movement left. */
type WalkContext = Omit<WalkPlan, 'mover' | 'path' | 'gridSize' | 'grid'>;

/** A walk the map previews, for the `walkPreview` hook: null feet when there is no way there. */
export interface WalkShown {
  token: string;
  to: Point;
  feet: number | null;
  warnings: { kind: WalkWarning['kind']; at: Point; text: string }[];
}

const OK_COLOR = 0xffffff;
const TOO_FAR_COLOR = 0xff8060;
const BLOCKED_COLOR = 0xd04a4a;
const LONG_RANGE_COLOR = 0xf0c040;
const AREA_COLOR = 0xff9040;

interface PreviewContext {
  gridSize: number;
  /** The scene's grid (none: aim at the very point and measure as the crow flies). */
  grid: GridKind;
  walls: readonly Wall[];
  zoom: number;
  force: boolean;
  /** What a step through each point costs (difficult ground the player knows of). */
  cost?: (p: Point) => number;
  /** What the pointer snapped to: aims go at a creature's centre. */
  snap?: Snap;
  /** The walk into range the action takes first (play/walk-in-range.ts): it is aimed from the end of it. */
  closeIn?: { points: readonly Point[]; feet: number };
}

/** The path a selected token would walk to the hovered square, with its length in feet. */
export class PathPreview {
  readonly container = new Container();
  /** What it draws, kept as shapes for the 3D view too (view3d/marks3d.ts). */
  readonly line = new Sketch(new Graphics());
  private label = new Text({
    text: '',
    style: { fill: OK_COLOR, fontSize: 28, fontWeight: '600', stroke: { color: 0x000000, width: 5 } },
  });
  /** What the walk would set off, under the label. */
  private notes = new Text({
    text: '',
    style: {
      fill: BLOCKED_COLOR,
      fontSize: 22,
      fontWeight: '600',
      stroke: { color: 0x000000, width: 4 },
      align: 'center',
    },
  });
  private shownFor?: string;
  /** What it shows now: a walk (to `end`), an attack or a spell aimed; the label and the notes under it, at `end`. */
  shown?: { kind: 'walk' | 'attack' | 'spell'; end: Point; label: string; color: number; notes: string };
  /** The way the walk shown goes, for the 3D view to climb it (view3d/climb3d.ts). */
  route?: { token: string; points: readonly Point[] };

  constructor() {
    this.label.anchor.set(0.5, 1.4);
    this.notes.anchor.set(0.5, 0);
    this.container.addChild(this.line.graphics, this.label, this.notes);
  }

  clear(): void {
    this.line.clear();
    this.label.text = '';
    this.notes.text = '';
    this.shownFor = undefined;
    this.shown = undefined;
    this.route = undefined;
  }

  /** Redraws unless the token and the hovered square are unchanged (or `force`); says what it drew. */
  show(
    token: TokenView,
    hover: Point,
    ctx: PreviewContext & { walk: WalkOptions; plan: WalkContext },
  ): WalkShown | undefined {
    const g = ctx.gridSize;
    const target = this.aim(hover, ctx);
    if (!this.needsRedraw(`walk:${target[0]},${target[1]}:${token.x},${token.y}`, ctx.force)) return undefined;
    const shown = { token: token.id, to: target };
    const path = walkPath([token.x, token.y], target, ctx.walls, {
      ...ctx.walk,
      cost: ctx.cost,
    });
    if (!path) {
      this.line.circle(target[0], target[1], g * 0.3).stroke({ width: 6, color: BLOCKED_COLOR });
      this.setLabel(t('walk.blocked'), BLOCKED_COLOR);
      this.placeLabel(target, ctx, 'walk');
      return { ...shown, feet: null, warnings: [] };
    }
    if (path.points.length < 2) return undefined;
    this.route = { token: token.id, points: path.points };
    const warnings = walkWarnings({ ...ctx.plan, mover: token, path: path.points, gridSize: g, grid: ctx.grid });
    const tooFar = warnings.find((w) => w.kind === 'tooFar');
    this.drawRoute(path.points, tooFar ? TOO_FAR_COLOR : OK_COLOR, g);
    if (tooFar) this.drawLine(tooFar.reach, OK_COLOR);
    for (const w of warnings) this.drawWarning(w, g);
    const budget = ctx.plan.budget;
    this.setLabel(
      Number.isFinite(budget) ? `${path.feet} / ${budget} ft` : `${path.feet} ft`,
      tooFar ? TOO_FAR_COLOR : OK_COLOR,
    );
    this.notes.text = warnings.map(warningText).join('\n');
    this.placeLabel(target, ctx, 'walk');
    return {
      ...shown,
      feet: path.feet,
      warnings: warnings.map((w) => ({ kind: w.kind, at: w.at, text: warningText(w) })),
    };
  }

  /** A mark where something happens along the way: a red ring where a foe may strike, with a line from it. */
  private drawWarning(w: WalkWarning, g: number): void {
    const l = this.line;
    if (w.kind === 'opportunity') {
      l.moveTo(...w.from)
        .lineTo(...w.at)
        .stroke({ width: 3, color: BLOCKED_COLOR, alpha: 0.7 });
      l.circle(w.at[0], w.at[1], g * 0.12).fill({ color: BLOCKED_COLOR, alpha: 0.9 });
    } else if (w.kind === 'tooFar') {
      l.circle(w.at[0], w.at[1], g * 0.08).fill({ color: TOO_FAR_COLOR });
    } else {
      l.circle(w.at[0], w.at[1], g * 0.1).stroke({ width: 4, color: LONG_RANGE_COLOR });
    }
  }

  /** A line from the attacker to the hovered square, saying whether it's in range. */
  showAttack(token: Token, hover: Point, attack: Attack, ctx: PreviewContext): void {
    const target = this.aim(hover, ctx);
    if (!this.needsRedraw(`attack:${attack.name}:${target[0]},${target[1]}:${token.x},${token.y}`, ctx.force)) return;
    const foe = ctx.snap?.kind === 'token' ? ctx.snap : undefined;
    const size = foe ? (foe.r * 2) / ctx.gridSize : 1;
    const feet = tokenDistance(token, { x: target[0], y: target[1], size }, ctx.gridSize, ctx.grid);
    const blocked = !hasLineOfSight([token.x, token.y], target, ctx.walls, { kind: 'sight', gridSize: ctx.gridSize });
    const range = blocked ? 'out' : attackRange(attack, feet);
    const color = { normal: OK_COLOR, long: LONG_RANGE_COLOR, out: BLOCKED_COLOR }[range];
    this.line.moveTo(token.x, token.y).lineTo(...target);
    this.line.stroke({ width: 4, color, alpha: 0.8 });
    this.line.circle(target[0], target[1], ctx.gridSize * 0.4).stroke({ width: 6, color });
    const note = { normal: '', long: ' · disadvantage', out: blocked ? ' · no clear shot' : ' · out of range' }[range];
    const at = foe ? ' → ' + foe.name : '';
    this.setLabel(`${attack.name}${at} · ${feet} ft${note}${this.walkFirst(ctx)}`, color);
    this.placeLabel(target, ctx, 'attack');
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
        ctx,
      );
    } else {
      this.line
        .moveTo(token.x, token.y)
        .lineTo(...target)
        .stroke({ width: 4, color, alpha: 0.8 });
      this.line.circle(target[0], target[1], ctx.gridSize * 0.4).stroke({ width: 6, color });
    }
    this.setLabel(previewLabel({ name: spell.name, count, feet, reach, blocked }) + this.walkFirst(ctx), color);
    this.placeLabel(target, ctx, 'spell');
  }

  /** Draws the walk into range the action takes first, and says how long it is. */
  private walkFirst(ctx: PreviewContext): string {
    if (!ctx.closeIn) return '';
    this.drawRoute([...ctx.closeIn.points], OK_COLOR, ctx.gridSize);
    return ' · ' + t('walk.first', { feet: ctx.closeIn.feet });
  }

  /** The area, and on hexes the hexes it covers. */
  private drawArea(shape: ReturnType<typeof areaShape>, ctx: PreviewContext): void {
    const hex = ctx.grid === 'hex-rows' || ctx.grid === 'hex-cols' ? latticeOf(ctx.grid, ctx.gridSize) : undefined;
    if (hex) fillCells(this.line, areaCells(shape, hex), hex, { color: AREA_COLOR, alpha: 0.3 });
    if (shape.kind === 'circle') this.line.circle(shape.center[0], shape.center[1], shape.radius);
    else this.line.poly(shape.points.flat());
    this.line.fill({ color: AREA_COLOR, alpha: hex ? 0.05 : 0.25 }).stroke({ width: 4, color: AREA_COLOR, alpha: 0.9 });
  }

  /** The hovered point, whole pixels without a grid, its square's centre on one. */
  private aim(hover: Point, ctx: PreviewContext): Point {
    const [x, y] = aimPoint(hover, { gridSize: ctx.gridSize, grid: ctx.grid });
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

  private placeLabel(target: Point, ctx: PreviewContext, kind: 'walk' | 'attack' | 'spell'): void {
    const color = typeof this.label.style.fill === 'number' ? this.label.style.fill : OK_COLOR;
    this.shown = { kind, end: target, label: this.label.text, color, notes: this.notes.text };
    const scale = Math.max(1, 0.8 / ctx.zoom);
    this.label.position.set(target[0], target[1] - ctx.gridSize * 0.3);
    this.label.scale.set(scale);
    this.notes.position.set(target[0], target[1] + ctx.gridSize * 0.4);
    this.notes.scale.set(scale);
  }

  private drawLine(points: readonly Point[], color: number): void {
    const l = this.line;
    l.moveTo(...points[0]!);
    for (const p of points.slice(1)) l.lineTo(...p);
    l.stroke({ width: 6, color, alpha: 0.8, cap: 'round', join: 'round' });
  }

  private drawRoute(points: Point[], color: number, g: number): void {
    const l = this.line;
    this.drawLine(points, color);
    const end = points.at(-1)!;
    l.circle(end[0], end[1], g * 0.3).stroke({ width: 6, color });
  }
}

/** Shows what the selected token would do at `hover`: cast the spell it aims, attack, or walk (round difficult ground the player knows of). */
export function showPreview(
  preview: PathPreview,
  session: Session,
  at: {
    token: TokenView;
    hover: Point;
    /** Every wall loaded; the preview keeps those of the creature's floor. */
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
    grid: gridKind(world),
    // The walls the creature meets: those of its own floor.
    walls: wallsOnFloor(at.walls, world.levels, token),
    zoom: at.zoom,
    force: at.force,
    cost: regionCost(regions, world.darkness),
  };
  const attack = token.sheet?.attacks.find((a) => a.name === session.actions.armed);
  if (session.actions.aiming || attack) return showAction(preview, session, { token, hover, attack }, ctx);
  const walk = walkOptions(world, token, session.tokens.values());
  const plan = {
    tokens: session.tokens.values(),
    regions,
    darkness: world.darkness,
    combat: session.combat,
    budget: session.turns.movementLeft(token.id),
  };
  const shown = preview.show(token, walkTarget(session, token, hover), { ...ctx, walk, plan });
  if (shown) session.scripts.hooks.call('walkPreview', shown);
}

/** The aimed spell or readied attack at `hover`, from the end of the walk into range it takes first. */
function showAction(
  preview: PathPreview,
  session: Session,
  { token, hover, attack }: { token: TokenView; hover: Point; attack?: Attack },
  ctx: PreviewContext,
): void {
  const snap = snapFor(session, hover);
  const aim = snap?.kind === 'token' ? snap.at : hover;
  const go = walkFirst(session, token, aim, snap);
  const end = go?.points.at(-1);
  const from = end ? { ...token, x: end[0], y: end[1] } : token;
  const acting = { ...ctx, snap, closeIn: go };
  if (session.actions.aiming) preview.showSpell(from, aim, session.actions.aiming, acting);
  else if (attack) preview.showAttack(from, aim, attack, acting);
}

/** The walk into range the action ready at `aim` takes first, if it takes one. */
function walkFirst(s: Session, token: TokenView, aim: Point, snap: Snap | undefined) {
  const snapId = snap?.kind === 'token' && snap.id !== token.id ? snap.id : undefined;
  const at = hoverAim(s, token, aim, snapId);
  const plan = at && rangePlan(s, token.id, at);
  return plan?.kind === 'walk' ? plan : undefined;
}

/** Where a click at `hover` walks `token`: up to the creature, door or tile the pointer snaps to, else the point. */
function walkTarget(s: Session, token: TokenView, hover: Point): Point {
  const snap = snapFor(s, hover);
  const g = s.world?.gridSize ?? 100;
  const other = snap && !(snap.kind === 'token' && snap.id === token.id);
  return other ? interactSpot(bodyOf(token, g), snap, g) : hover;
}

/** A warning in words, for the lines under the label. */
function warningText(w: WalkWarning): string {
  if (w.kind === 'opportunity') return t('walk.opportunity', { name: w.name });
  if (w.kind === 'trap') return w.name ? t('walk.trap', { name: w.name }) : t('walk.trapUnnamed');
  return t(w.kind === 'tooFar' ? 'walk.tooFar' : 'walk.difficult');
}

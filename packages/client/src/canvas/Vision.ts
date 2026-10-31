import {
  ambientLevel,
  isGm,
  feetToPx,
  sensesOf,
  tokenLights,
  visibilityPolygon,
  type LightSource,
  type Point,
  type Rect,
  type Senses,
  type TokenView,
  type Wall,
} from '@vtt/shared';
import { Container, Graphics, type Application } from 'pixi.js';
import type { Session } from '../session.ts';
import { FogMemory } from './lighting/FogMemory.ts';
import { LightingFilter } from './lighting/LightingFilter.ts';
import { LightMap, type LightScene } from './lighting/LightMap.ts';
import { SightMap } from './lighting/SightMap.ts';

/** How far a token can see when nothing blocks it, in squares. */
const SIGHT_SQUARES = 40;
/** How much darkness the GM sees, relative to players. */
const GM_DARKNESS = 0.5;
/** Tokens never get darker than this share of their colour, so the party stays readable at night. */
const TOKEN_FLOOR = 0.5;

export interface Viewer {
  token: TokenView;
  /** Where the token is drawn right now, which differs from token.x/y mid-walk. */
  at: Point;
}

export interface Camera {
  center: Point;
  zoom: number;
}

/**
 * Lighting, senses and fog of war. Each frame it draws what light falls
 * where and what your tokens perceive into two screen-sized textures, and two
 * lighting filters use them: one over the map (which also hides what you
 * can't see) and one over the tokens.
 */
export class Vision {
  readonly mapFilter: LightingFilter;
  readonly tokenFilter: LightingFilter;
  private light: LightMap;
  private sight: SightMap;
  private explored: FogMemory;
  /** What the last stamp of explored ground was made from, so it isn't repeated. */
  private stamped = '';
  private polyCache = new Map<string, number[]>();
  private wallsVersion = 0;

  constructor(
    private app: Application,
    private session: Session,
  ) {
    this.light = new LightMap(app.renderer);
    this.explored = new FogMemory(app.renderer, () => session.world?.chunkSize ?? 2000);
    this.sight = new SightMap(app.renderer, this.explored.layer);
    const maps = { light: this.light.texture, sight: this.sight.texture };
    this.mapFilter = new LightingFilter({ ...maps, fog: 1, floor: 0, opaque: 1 });
    this.tokenFilter = new LightingFilter({ ...maps, fog: 0, floor: TOKEN_FLOOR, opaque: 0 });
    this.resize();
  }

  resize(): void {
    const { width, height } = this.app.screen;
    this.light.resize(width, height);
    this.sight.resize(width, height);
    this.mapFilter.resize(width, height);
    this.tokenFilter.resize(width, height);
  }

  /** Call when walls change so sight and light shapes are rebuilt. */
  wallsChanged(): void {
    this.wallsVersion++;
    this.polyCache.clear();
    this.light.wallsChanged();
  }

  /** Loads the explored squares remembered for this world and player. */
  loadExplored(): void {
    const world = this.session.world;
    if (world) this.explored.load(`vtt-fog:${world.name}:${this.session.playerId}`);
    this.stamped = '';
  }

  destroy(): void {
    this.explored.destroy();
    this.light.destroy();
    this.sight.destroy();
  }

  private polygon(walls: readonly Wall[]) {
    return (origin: Point, radius: number): number[] => {
      const key = `${origin[0]},${origin[1]},${radius},${this.wallsVersion}`;
      let poly = this.polyCache.get(key);
      if (!poly) {
        poly = visibilityPolygon(origin, radius, walls);
        if (this.polyCache.size > 500) this.polyCache.clear();
        this.polyCache.set(key, poly);
      }
      return poly;
    };
  }

  /**
   * Redraws light and sight for the current camera. Returns true when a
   * light on screen is animated, so the caller keeps calling every frame.
   */
  render(camera: Camera, walls: readonly Wall[], viewers: Viewer[], settled: boolean): boolean {
    const world = this.session.world;
    const you = this.session.you;
    if (!world || !you) return false;
    const { width, height } = this.app.screen;
    const transform = {
      scale: camera.zoom,
      x: width / 2 - camera.center[0] * camera.zoom,
      y: height / 2 - camera.center[1] * camera.zoom,
    };
    const view: Rect = {
      x: camera.center[0] - width / 2 / camera.zoom,
      y: camera.center[1] - height / 2 / camera.zoom,
      w: width / camera.zoom,
      h: height / camera.zoom,
    };
    const gm = isGm(you);
    const polygon = this.polygon(walls);
    const lights = this.lights(viewers);
    const scene: LightScene = {
      view,
      darkness: world.darkness * (gm ? GM_DARKNESS : 1),
      gridSize: world.gridSize,
      lights,
      polygon,
      now: performance.now(),
    };
    this.light.render(scene, transform);
    const eyes = viewers.map((v) => ({ at: v.at, senses: sensesOfView(v.token) }));
    const sightRadius = SIGHT_SQUARES * world.gridSize;
    this.explored.show(view);
    if (settled && !gm) this.markExplored(eyes, lights, polygon);
    const darkness = lights.filter((l) => l.darkness);
    this.sight.render({ view, gridSize: world.gridSize, viewers: eyes, darkness, sightRadius, polygon }, transform);
    this.mapFilter.fog = !gm && world.vision ? 1 : 0;
    return this.light.animated(scene);
  }

  /** Every light, with your own tokens' lights where they're drawn mid-walk. */
  private lights(viewers: Viewer[]): LightSource[] {
    const yours = new Set(viewers.map((v) => v.token.id));
    return [
      ...[...this.session.chunks.values()].flatMap((c) => c.lights),
      ...tokenLights(viewers.map((v) => ({ ...v.token, x: v.at[0], y: v.at[1] }))),
      ...tokenLights([...this.session.tokens.values()].filter((t) => !yours.has(t.id))),
    ];
  }

  /** Paints what your tokens can make out now into the explored memory. */
  private markExplored(eyes: Eye[], lights: LightSource[], polygon: Polygon): void {
    const world = this.session.world!;
    const sight = SIGHT_SQUARES * world.gridSize;
    const key = `${JSON.stringify(eyes.map((e) => e.at))}|${this.wallsVersion}|${lights.length}|${world.darkness}`;
    if (eyes.length === 0 || key === this.stamped) return;
    this.stamped = key;
    const shape = new Container();
    const dark = ambientLevel(world.darkness) === 'dark';
    for (const e of eyes) shape.addChild(...visibleFrom(e, { dark, lights, polygon, sight, gridSize: world.gridSize }));
    const xs = eyes.map((e) => e.at[0]);
    const ys = eyes.map((e) => e.at[1]);
    const bounds = { x: Math.min(...xs) - sight, y: Math.min(...ys) - sight, w: 0, h: 0 };
    bounds.w = Math.max(...xs) + sight - bounds.x;
    bounds.h = Math.max(...ys) + sight - bounds.y;
    this.explored.stamp(shape, bounds, (key) => this.session.chunks.has(key));
    shape.destroy({ children: true });
  }
}

type Polygon = (at: Point, radius: number) => number[];
interface Eye {
  at: Point;
  senses: Senses;
}

/**
 * What one token can make out, in white: everything in sight by day; at night
 * only what its senses reach and what lights it can see fall on.
 */
function visibleFrom(
  eye: Eye,
  ctx: { dark: boolean; lights: LightSource[]; polygon: Polygon; sight: number; gridSize: number },
): Container[] {
  const inSight = ctx.polygon(eye.at, ctx.sight);
  if (!ctx.dark) return [new Graphics().poly(inSight).fill(0xffffff)];
  const s = eye.senses;
  const sense = feetToPx(Math.max(s.darkvision, s.blindsight, s.truesight, s.devilsSight), ctx.gridSize);
  const out: Container[] = [];
  if (sense > 0) out.push(new Graphics().poly(ctx.polygon(eye.at, sense)).fill(0xffffff));
  for (const l of ctx.lights) {
    const reach = feetToPx(l.bright + l.dim, ctx.gridSize);
    if (l.darkness || reach <= 0 || Math.hypot(l.x - eye.at[0], l.y - eye.at[1]) > ctx.sight + reach) continue;
    const lit = new Container();
    const mask = new Graphics().poly(inSight).fill(0xffffff);
    lit.addChild(new Graphics().poly(ctx.polygon([l.x, l.y], reach)).fill(0xffffff), mask);
    lit.mask = mask;
    out.push(lit);
  }
  return out;
}

/** A token's senses as the server worked them out, or from its own fields if it didn't. */
function sensesOfView(token: TokenView): Senses {
  return token.senses ?? sensesOf(token);
}

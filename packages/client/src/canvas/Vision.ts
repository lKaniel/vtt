import {
  isGm,
  type LightSource,
  type Point,
  type Rect,
  type Senses,
  SIGHT_SQUARES,
  tokenLights,
  visibilityPolygon,
  type Wall,
} from '@vtt/shared';
import { sensesOf, type TokenView } from '@vtt/system-dnd5e';
import type { Application } from 'pixi.js';
import type { Session } from '../session.ts';
import { FogLayer } from './lighting/FogLayer.ts';
import { LightingFilter } from './lighting/LightingFilter.ts';
import { LightMap, type LightScene } from './lighting/LightMap.ts';
import { SightMap } from './lighting/SightMap.ts';

/** How much darkness the GM sees, relative to players. */
const GM_DARKNESS = 0.5;
/** Tokens never get darker than this share of their colour, so the party stays readable at night. */
const TOKEN_FLOOR = 0.5;
/** How strongly the GM's fog brush view hides unexplored ground: enough to tell it, not to hide the map. */
const GM_FOG = 0.6;

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
  private explored = new FogLayer();
  /** The session's fog version last drawn. */
  private fogVersion = -1;
  private polyCache = new Map<string, number[]>();
  private wallsVersion = 0;

  constructor(
    private app: Application,
    private session: Session,
  ) {
    this.light = new LightMap(app.renderer);
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
  render(camera: Camera, walls: readonly Wall[], viewers: Viewer[]): boolean {
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
    // The GM's fog brush shows what the players explored instead of what the GM's tokens see.
    const brushing = gm && !!this.session.fogBrush;
    const eyes = brushing ? [] : viewers.map((v) => ({ at: v.at, senses: sensesOfView(v.token) }));
    const sightRadius = SIGHT_SQUARES * world.gridSize;
    this.showExplored();
    const darkness = lights.filter((l) => l.darkness);
    this.sight.render({ view, gridSize: world.gridSize, viewers: eyes, darkness, sightRadius, polygon }, transform);
    this.mapFilter.fog = fogStrength(gm, brushing, world.vision);
    this.mapFilter.voidColor = world.background;
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

  /** Draws explored ground as the server last sent it. */
  private showExplored(): void {
    if (this.fogVersion === this.session.fogVersion) return;
    this.fogVersion = this.session.fogVersion;
    this.explored.show(this.session.shownFog());
  }
}

/** How much the map is hidden outside sight: fully for players with fog of war, partly while the GM paints fog. */
function fogStrength(gm: boolean, brushing: boolean, vision: boolean): number {
  if (brushing) return GM_FOG;
  return !gm && vision ? 1 : 0;
}

/** A token's senses as the server worked them out, or from its own fields if it didn't. */
function sensesOfView(token: TokenView): Senses {
  return token.senses ?? sensesOf(token);
}

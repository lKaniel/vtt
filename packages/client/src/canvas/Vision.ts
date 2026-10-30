import {
  feetToPx,
  tokenLights,
  visibilityPolygon,
  type LightSource,
  type Point,
  type Rect,
  type Token,
  type Wall,
} from '@vtt/shared';
import { Container, Graphics, RenderTexture, Sprite, type Application } from 'pixi.js';
import type { Session } from '../session.ts';
import { ExploredMap } from './ExploredMap.ts';

/** How far a token can see when nothing blocks it, in squares. */
const SIGHT_SQUARES = 40;
/** How much darkness the GM sees, relative to players. */
const GM_DARKNESS = 0.5;
/** Darkvision lifts this share of the darkness. */
const DARKVISION = 0.5;

export interface Viewer {
  token: Token;
  /** Where the token is drawn right now, which differs from token.x/y mid-walk. */
  at: Point;
}

interface Scene {
  walls: readonly Wall[];
  viewers: Viewer[];
  lights: LightSource[];
}

export interface Camera {
  center: Point;
  zoom: number;
}

/**
 * Draws two screen-sized overlays above the map: darkness (cut by lights and
 * darkvision) and fog of war (black where you've never been, dimmed where
 * you've been, clear where your tokens can see now). Each is a render
 * texture, with lit or seen areas erased from a filled rectangle.
 */
export class Vision {
  private darkTex: RenderTexture;
  private fogTex: RenderTexture;
  private darkSprite: Sprite;
  private fogSprite: Sprite;
  private scene = new Container();
  private background = new Graphics();
  /** Shapes erased from the background this frame. */
  private shapes = new Container();
  private explored = new ExploredMap();
  private polyCache = new Map<string, number[]>();
  private wallsVersion = 0;

  constructor(
    private app: Application,
    private session: Session,
  ) {
    this.darkTex = this.makeTexture();
    this.fogTex = this.makeTexture();
    this.darkSprite = new Sprite(this.darkTex);
    this.fogSprite = new Sprite(this.fogTex);
    this.darkSprite.eventMode = 'none';
    this.fogSprite.eventMode = 'none';
    this.scene.addChild(this.background, this.explored.graphic, this.shapes);
  }

  /** The overlays, to be added above the map. */
  get sprites(): Sprite[] {
    return [this.darkSprite, this.fogSprite];
  }

  private makeTexture(): RenderTexture {
    const { width, height } = this.app.screen;
    return RenderTexture.create({ width, height, resolution: this.app.renderer.resolution });
  }

  resize(): void {
    for (const [tex, sprite] of [
      [this.darkTex, this.darkSprite],
      [this.fogTex, this.fogSprite],
    ] as const) {
      tex.resize(this.app.screen.width, this.app.screen.height);
      sprite.texture = tex;
    }
  }

  /** Call when walls change so cached sight polygons are rebuilt. */
  wallsChanged(): void {
    this.wallsVersion++;
    this.polyCache.clear();
  }

  /** Loads the explored squares remembered for this world and player. */
  loadExplored(): void {
    const world = this.session.world;
    if (world) this.explored.load(`vtt-explored:${world.name}:${this.session.playerId}`);
  }

  destroy(): void {
    this.explored.destroy();
    this.darkTex.destroy(true);
    this.fogTex.destroy(true);
    this.scene.destroy({ children: true });
    for (const s of this.sprites) s.destroy();
  }

  private polygon(origin: Point, radius: number, walls: readonly Wall[]): number[] {
    const key = `${origin[0]},${origin[1]},${radius},${this.wallsVersion}`;
    let poly = this.polyCache.get(key);
    if (!poly) {
      poly = visibilityPolygon(origin, radius, walls);
      if (this.polyCache.size > 500) this.polyCache.clear();
      this.polyCache.set(key, poly);
    }
    return poly;
  }

  /** Redraws both overlays for the current camera, walls and viewers. */
  render(camera: Camera, walls: readonly Wall[], viewers: Viewer[], settled: boolean): void {
    const world = this.session.world;
    const you = this.session.you;
    if (!world || !you) return;
    const { width, height } = this.app.screen;
    this.scene.scale.set(camera.zoom);
    this.scene.position.set(width / 2 - camera.center[0] * camera.zoom, height / 2 - camera.center[1] * camera.zoom);
    const view: Rect = {
      x: camera.center[0] - width / 2 / camera.zoom,
      y: camera.center[1] - height / 2 / camera.zoom,
      w: width / camera.zoom,
      h: height / camera.zoom,
    };
    const lights = this.lights(viewers);
    const isGm = you.role === 'gm';
    this.renderDarkness(view, world.darkness * (isGm ? GM_DARKNESS : 1), { walls, viewers, lights });
    const fog = !isGm && world.vision;
    this.fogSprite.visible = fog;
    if (fog) this.renderFog(view, { walls, viewers, lights }, settled);
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

  /** Darkness over the map, cut by lights and darkvision. */
  private renderDarkness(view: Rect, darkness: number, scene: Scene): void {
    this.darkSprite.visible = darkness > 0;
    if (darkness <= 0) return;
    const g = this.session.world!.gridSize;
    this.reset(view, 0x05060a, darkness);
    this.explored.graphic.visible = false;
    for (const l of scene.lights) {
      const at: Point = [l.x, l.y];
      const dim = feetToPx(l.bright + l.dim, g);
      if (dim > 0) this.erase(this.polygon(at, dim, scene.walls), 0.5);
      const bright = feetToPx(l.bright, g);
      if (bright > 0) this.erase(this.polygon(at, bright, scene.walls), 1);
    }
    for (const v of scene.viewers) {
      const dv = feetToPx(v.token.darkvision, g);
      if (dv > 0) this.erase(this.polygon(v.at, dv, scene.walls), DARKVISION);
    }
    this.app.renderer.render({ container: this.scene, target: this.darkTex, clear: true });
  }

  /** Black where you've never been, dimmed where you've been, clear where you see now. */
  private renderFog(view: Rect, scene: Scene, settled: boolean): void {
    const world = this.session.world!;
    const sight = SIGHT_SQUARES * world.gridSize;
    const polys = scene.viewers.map((v) => ({ v, poly: this.polygon(v.at, sight, scene.walls) }));
    if (settled) {
      const ctx = {
        gridSize: world.gridSize,
        chunkSize: world.chunkSize,
        loaded: (key: string) => this.session.chunks.has(key),
        dark: world.darkness >= 0.5,
        lights: scene.lights,
      };
      for (const { v, poly } of polys) this.explored.markSeen({ at: v.at, darkvision: v.token.darkvision }, poly, ctx);
    }
    this.explored.draw(world.gridSize);
    this.reset(view, 0x000000, 1);
    this.explored.graphic.visible = true;
    for (const { poly } of polys) this.erase(poly, 1);
    this.app.renderer.render({ container: this.scene, target: this.fogTex, clear: true });
  }

  private reset(view: Rect, color: number, alpha: number): void {
    this.background.clear().rect(view.x, view.y, view.w, view.h).fill({ color, alpha });
    for (const child of this.shapes.removeChildren()) child.destroy();
  }

  /** Erases a polygon from the background; amount 1 clears it fully. */
  private erase(poly: number[], amount: number): void {
    const shape = new Graphics().poly(poly).fill({ color: 0xffffff, alpha: amount });
    shape.blendMode = 'erase';
    this.shapes.addChild(shape);
  }
}

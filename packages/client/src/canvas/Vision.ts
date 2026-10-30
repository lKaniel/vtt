import { chunkOf, feetToPx, pointInPolygon, tokenLights, visibilityPolygon, type Point, type Token, type Wall } from '@vtt/shared';
import { Container, Graphics, RenderTexture, Sprite, type Application } from 'pixi.js';
import type { Session } from '../session.ts';

/** How far a token can see when nothing blocks it, in squares. */
const SIGHT_SQUARES = 40;
/** Fog over areas you've seen before but can't see now. */
const EXPLORED_FOG = 0.55;
/** How much darkness the GM sees, relative to players. */
const GM_DARKNESS = 0.5;
/** Darkvision lifts this share of the darkness. */
const DARKVISION = 0.5;

export interface Viewer {
  token: Token;
  /** Where the token is drawn right now, which differs from token.x/y mid-walk. */
  at: Point;
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
  private explored = new Set<string>();
  private exploredGraphic = new Graphics();
  private exploredDirty = true;
  private polyCache = new Map<string, number[]>();
  private wallsVersion = 0;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private storageKey?: string;

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
    this.scene.addChild(this.background, this.exploredGraphic, this.shapes);
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
    if (!world) return;
    this.storageKey = `vtt-explored:${world.name}:${this.session.playerId}`;
    this.explored.clear();
    try {
      for (const k of JSON.parse(localStorage.getItem(this.storageKey) ?? '[]') as string[]) this.explored.add(k);
    } catch {
      // A broken or blocked store just means starting with nothing explored.
    }
    this.exploredDirty = true;
  }

  destroy(): void {
    clearTimeout(this.saveTimer);
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
    const g = world.gridSize;
    const isGm = you.role === 'gm';
    const { width, height } = this.app.screen;
    this.scene.scale.set(camera.zoom);
    this.scene.position.set(width / 2 - camera.center[0] * camera.zoom, height / 2 - camera.center[1] * camera.zoom);
    const view = {
      x: camera.center[0] - width / 2 / camera.zoom,
      y: camera.center[1] - height / 2 / camera.zoom,
      w: width / camera.zoom,
      h: height / camera.zoom,
    };

    // Darkness, cut by lights and darkvision.
    const darkness = world.darkness * (isGm ? GM_DARKNESS : 1);
    this.darkSprite.visible = darkness > 0;
    this.exploredGraphic.visible = false;
    if (darkness > 0) {
      this.reset(view, 0x05060a, darkness);
      const lights = [
        ...[...this.session.chunks.values()].flatMap((c) => c.lights),
        ...tokenLights(viewers.map((v) => ({ ...v.token, x: v.at[0], y: v.at[1] }))),
        ...tokenLights([...this.session.tokens.values()].filter((t) => !viewers.some((v) => v.token.id === t.id))),
      ];
      for (const l of lights) {
        const at: Point = [l.x, l.y];
        const dim = feetToPx(l.bright + l.dim, g);
        if (dim > 0) this.erase(this.polygon(at, dim, walls), 0.5);
        const bright = feetToPx(l.bright, g);
        if (bright > 0) this.erase(this.polygon(at, bright, walls), 1);
      }
      for (const v of viewers) {
        const dv = feetToPx(v.token.darkvision, g);
        if (dv > 0) this.erase(this.polygon(v.at, dv, walls), DARKVISION);
      }
      this.app.renderer.render({ container: this.scene, target: this.darkTex, clear: true });
    }

    // Fog of war, players only.
    const fog = !isGm && world.vision;
    this.fogSprite.visible = fog;
    if (!fog) return;
    const sight = SIGHT_SQUARES * g;
    const polys = viewers.map((v) => ({ v, poly: this.polygon(v.at, sight, walls) }));
    if (settled) for (const { v, poly } of polys) this.explore(v, poly, world.darkness >= 0.5);
    if (this.exploredDirty) this.drawExplored(g);
    this.reset(view, 0x000000, 1);
    this.exploredGraphic.visible = true;
    for (const { poly } of polys) this.erase(poly, 1);
    this.app.renderer.render({ container: this.scene, target: this.fogTex, clear: true });
  }

  private reset(view: { x: number; y: number; w: number; h: number }, color: number, alpha: number): void {
    this.background.clear().rect(view.x, view.y, view.w, view.h).fill({ color, alpha });
    for (const child of this.shapes.removeChildren()) child.destroy();
  }

  /** Erases a polygon from the background; amount 1 clears it fully. */
  private erase(poly: number[], amount: number): void {
    const shape = new Graphics().poly(poly).fill({ color: 0xffffff, alpha: amount });
    shape.blendMode = 'erase';
    this.shapes.addChild(shape);
  }

  /** Marks the squares this viewer can make out as explored. */
  private explore(v: Viewer, poly: number[], dark: boolean): void {
    const world = this.session.world!;
    const g = world.gridSize;
    const lights = [...this.session.chunks.values()].flatMap((c) => c.lights);
    for (const t of this.session.tokens.values()) if (t.light) lights.push({ ...t.light, id: t.id, x: t.x, y: t.y });
    const dv = feetToPx(v.token.darkvision, g);
    let xs = Infinity, ys = Infinity, xe = -Infinity, ye = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      xs = Math.min(xs, poly[i]!); xe = Math.max(xe, poly[i]!);
      ys = Math.min(ys, poly[i + 1]!); ye = Math.max(ye, poly[i + 1]!);
    }
    let added = false;
    for (let r = Math.floor(ys / g); r <= Math.floor(ye / g); r++) {
      for (let c = Math.floor(xs / g); c <= Math.floor(xe / g); c++) {
        const key = `${c},${r}`;
        if (this.explored.has(key)) continue;
        const p: Point = [(c + 0.5) * g, (r + 0.5) * g];
        // Walls outside loaded chunks are unknown, so sight there can't be trusted.
        if (!this.session.chunks.has(chunkOf(p[0], p[1], world.chunkSize))) continue;
        if (!pointInPolygon(p, poly)) continue;
        const seen =
          !dark ||
          Math.hypot(p[0] - v.at[0], p[1] - v.at[1]) <= dv ||
          lights.some((l) => Math.hypot(p[0] - l.x, p[1] - l.y) <= feetToPx(l.bright + l.dim, g));
        if (!seen) continue;
        this.explored.add(key);
        added = true;
      }
    }
    if (added) {
      this.exploredDirty = true;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveExplored(), 1500);
    }
  }

  private saveExplored(): void {
    if (!this.storageKey) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify([...this.explored]));
    } catch {
      // Storage full or blocked: exploration just won't survive a reload.
    }
  }

  private drawExplored(g: number): void {
    this.exploredDirty = false;
    const e = this.exploredGraphic.clear();
    // Merge each row into runs so a big explored area is a few rectangles, not thousands.
    const rows = new Map<number, number[]>();
    for (const key of this.explored) {
      const [c, r] = key.split(',').map(Number) as [number, number];
      let row = rows.get(r);
      if (!row) rows.set(r, (row = []));
      row.push(c);
    }
    for (const [r, cols] of rows) {
      cols.sort((a, b) => a - b);
      let start = cols[0]!;
      let prev = start;
      for (const c of [...cols.slice(1), Infinity]) {
        if (c === prev + 1) {
          prev = c;
          continue;
        }
        e.rect(start * g, r * g, (prev - start + 1) * g, g);
        start = prev = c;
      }
    }
    e.fill({ color: 0xffffff, alpha: 1 - EXPLORED_FOG });
    e.blendMode = 'erase';
  }
}

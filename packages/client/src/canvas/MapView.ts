import { chunkKey, type Point, type Rect, type Wall } from '@vtt/shared';
import { Application, Container, CullerPlugin, extensions, Graphics, type FederatedPointerEvent } from 'pixi.js';
import type { Session } from '../session.ts';
import { ChunkLayer } from './ChunkLayer.ts';
import { PathPreview } from './PathPreview.ts';
import { TokenLayer } from './TokenLayer.ts';
import { Vision } from './Vision.ts';

extensions.add(CullerPlugin);

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
const WHEEL_ZOOM_SPEED = 0.0015;
/** Below these zoom levels the matching detail is skipped, so a zoomed-out map stays cheap. */
const LOD = { grid: 0.35, labels: 0.45, doors: 0.25 };
/** Extra chunks loaded around the screen, so panning doesn't show holes. */
const CHUNK_MARGIN = 1;
/** Beyond this many chunks across, keep what's loaded instead of asking for more. */
const MAX_CHUNK_SPAN = 24;
const DRAG_THRESHOLD = 5;

interface Drag {
  start: Point;
  last: Point;
  panning: boolean;
  button: number;
}

/**
 * The PixiJS map: an unbounded world split into chunks, streamed in around
 * the camera. Only what's on screen is drawn, and fine detail (grid, labels,
 * door handles) drops out as you zoom out.
 */
export class MapView {
  readonly app = new Application();
  private camera = new Container();
  /** Drawn above darkness and fog, with the same transform as the camera. */
  private overhead = new Container();
  private grid = new Graphics();
  private chunks: ChunkLayer;
  private tokens: TokenLayer;
  private preview = new PathPreview();
  private vision?: Vision;

  /** World point at the centre of the screen. */
  private center: Point = [0, 0];
  private zoom = 0.6;
  private dirty = true;
  private visionDirty = true;
  private wasWalking = false;
  private viewId = '';
  private drag?: Drag;
  private hoverPoint?: Point;
  private unsubscribe: (() => void)[] = [];
  private destroyed = false;

  constructor(private session: Session) {
    this.chunks = new ChunkLayer(session);
    this.tokens = new TokenLayer(session);
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x1b1d22,
      antialias: true,
      autoDensity: true,
      resolution: devicePixelRatio,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    host.appendChild(this.app.canvas);
    this.camera.addChild(this.chunks.ground, this.grid, this.chunks.walls, this.tokens.container);
    this.overhead.addChild(this.preview.container);
    // Previews are drawn over tokens; clicks must still reach the tokens below.
    this.overhead.eventMode = 'none';
    this.vision = new Vision(this.app, this.session);
    this.app.stage.addChild(this.camera, ...this.vision.sprites, this.overhead);
    this.listenToInput();
    this.listenToSession();
    this.app.ticker.add((t) => {
      this.tick(t.deltaMS / 1000);
    });
    this.tokens.redrawAll();
  }

  destroy(): void {
    this.destroyed = true;
    for (const off of this.unsubscribe) off();
    this.vision?.destroy();
    if ((this.app.renderer as unknown) !== undefined) {
      this.app.canvas.removeEventListener('wheel', this.onWheel);
      this.app.destroy(true, { children: true });
    }
  }

  private listenToInput(): void {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    stage.on('pointerdown', (e) => {
      this.onPointerDown(e);
    });
    stage.on('globalpointermove', (e) => {
      this.onPointerMove(e);
    });
    stage.on('pointerup', (e) => {
      this.onPointerUp(e);
    });
    stage.on('pointerupoutside', () => {
      this.drag = undefined;
    });
    this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.app.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    this.app.renderer.on('resize', () => {
      this.vision?.resize();
      this.dirty = true;
    });
  }

  private listenToSession(): void {
    const s = this.session;
    const visionChanged = () => {
      this.visionDirty = true;
    };
    this.unsubscribe.push(
      s.on('welcome', () => {
        this.onWelcome();
      }),
      s.on('chunk', (key) => {
        const chunk = s.chunks.get(key);
        if (chunk) this.chunks.draw(key, chunk);
        this.wallsChanged();
      }),
      s.on('chunkGone', (key) => {
        if (this.chunks.remove(key)) this.wallsChanged();
      }),
      s.on('token', (t) => {
        this.tokens.draw(t);
        visionChanged();
      }),
      s.on('tokenGone', (id) => {
        this.tokens.remove(id);
        visionChanged();
      }),
      s.on('moved', (id, path) => {
        this.tokens.walk(id, path);
        this.updatePreview(true);
      }),
      s.on('select', () => {
        this.tokens.redrawAll();
        this.updatePreview(true);
      }),
      s.on('combat', () => {
        this.tokens.redrawAll();
        this.updatePreview(true);
      }),
      s.on('armed', () => {
        this.tokens.redrawAll();
        this.updatePreview(true);
      }),
      s.on('focus', (p) => {
        this.center = [...p];
        this.dirty = true;
      }),
    );
  }

  private onWelcome(): void {
    const world = this.session.world;
    if (world && !this.viewId) this.center = [...world.start];
    this.vision?.loadExplored();
    for (const key of this.chunks.keys) this.chunks.remove(key);
    this.wallsChanged();
  }

  private wallsChanged(): void {
    this.vision?.wallsChanged();
    this.visionDirty = true;
    this.dirty = true;
    this.updatePreview(true);
  }

  private allWalls(): Wall[] {
    return [...this.session.chunks.values()].flatMap((c) => c.walls);
  }

  // Frame -------------------------------------------------------------------

  private tick(dt: number): void {
    const walking = this.tokens.animate(dt);
    if (!this.session.world) return;
    // One more render after a walk ends, to mark what the token now sees as explored.
    const stopped = this.wasWalking && !walking;
    this.wasWalking = walking;
    if (this.dirty || this.visionDirty || walking || stopped) {
      this.visionDirty = false;
      this.vision?.render({ center: this.center, zoom: this.zoom }, this.allWalls(), this.tokens.viewers(), !walking);
    }
    if (this.dirty) this.applyCamera();
  }

  private applyCamera(): void {
    this.dirty = false;
    const { width, height } = this.app.screen;
    for (const layer of [this.camera, this.overhead]) {
      layer.scale.set(this.zoom);
      layer.position.set(width / 2 - this.center[0] * this.zoom, height / 2 - this.center[1] * this.zoom);
    }
    this.session.viewRect = this.visibleRect();
    this.requestChunks();
    this.drawGrid();
    this.tokens.showLabels(this.zoom >= LOD.labels);
    this.chunks.showDoors(this.zoom >= LOD.doors);
  }

  private screenToWorld(x: number, y: number): Point {
    const { width, height } = this.app.screen;
    return [this.center[0] + (x - width / 2) / this.zoom, this.center[1] + (y - height / 2) / this.zoom];
  }

  private visibleRect(): Rect {
    const [x0, y0] = this.screenToWorld(0, 0);
    const [x1, y1] = this.screenToWorld(this.app.screen.width, this.app.screen.height);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  private requestChunks(): void {
    const size = this.session.world!.chunkSize;
    const r = this.visibleRect();
    const cx0 = Math.floor(r.x / size) - CHUNK_MARGIN;
    const cy0 = Math.floor(r.y / size) - CHUNK_MARGIN;
    const cx1 = Math.floor((r.x + r.w) / size) + CHUNK_MARGIN;
    const cy1 = Math.floor((r.y + r.h) / size) + CHUNK_MARGIN;
    if (Math.max(cx1 - cx0, cy1 - cy0) > MAX_CHUNK_SPAN) return;
    const keys: string[] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) keys.push(chunkKey(cx, cy));
    const id = keys.join(' ');
    if (id === this.viewId) return;
    this.viewId = id;
    this.session.setView(keys);
  }

  private drawGrid(): void {
    const g = this.grid.clear();
    if (this.zoom < LOD.grid) return;
    const size = this.session.world!.gridSize;
    const r = this.visibleRect();
    for (let x = Math.floor(r.x / size) * size; x <= r.x + r.w; x += size) g.moveTo(x, r.y).lineTo(x, r.y + r.h);
    for (let y = Math.floor(r.y / size) * size; y <= r.y + r.h; y += size) g.moveTo(r.x, y).lineTo(r.x + r.w, y);
    g.stroke({ width: 1 / this.zoom, color: 0x000000, alpha: 0.18 });
  }

  // Input -------------------------------------------------------------------

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED)));
    const after = this.screenToWorld(sx, sy);
    this.center = [this.center[0] + before[0] - after[0], this.center[1] + before[1] - after[1]];
    this.dirty = true;
  };

  private onPointerDown(e: FederatedPointerEvent): void {
    const p: Point = [e.global.x, e.global.y];
    this.drag = { start: p, last: p, panning: e.button !== 0, button: e.button };
  }

  private onPointerMove(e: FederatedPointerEvent): void {
    const p: Point = [e.global.x, e.global.y];
    if (this.drag) this.dragTo(this.drag, p);
    this.hoverPoint = this.screenToWorld(p[0], p[1]);
    this.updatePreview(false);
  }

  private dragTo(drag: Drag, p: Point): void {
    if (Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) > DRAG_THRESHOLD) drag.panning = true;
    if (drag.panning) {
      this.center = [
        this.center[0] - (p[0] - drag.last[0]) / this.zoom,
        this.center[1] - (p[1] - drag.last[1]) / this.zoom,
      ];
      this.dirty = true;
    }
    drag.last = p;
  }

  private onPointerUp(e: FederatedPointerEvent): void {
    const drag = this.drag;
    this.drag = undefined;
    if (!drag || drag.panning || drag.button !== 0) return;
    // Clicking the ground with an attack ready puts it away instead of walking.
    if (this.session.armed) return this.session.arm(undefined);
    const selected = this.session.selected;
    if (selected) this.session.move(selected, this.screenToWorld(e.global.x, e.global.y));
  }

  private updatePreview(force: boolean): void {
    const world = this.session.world;
    const token = this.session.selected ? this.session.tokens.get(this.session.selected) : undefined;
    if (!world || !token || !this.hoverPoint || this.drag?.panning) {
      this.preview.clear();
      return;
    }
    const ctx = { gridSize: world.gridSize, walls: this.allWalls(), zoom: this.zoom, force };
    const attack = token.sheet?.attacks.find((a) => a.name === this.session.armed);
    if (attack) this.preview.showAttack(token, this.hoverPoint, attack, ctx);
    else this.preview.show(token, this.hoverPoint, { ...ctx, budget: this.session.movementLeft(token.id) });
  }
}

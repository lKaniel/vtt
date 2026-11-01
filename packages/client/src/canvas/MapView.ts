import { chunkKey, type EditorMode, type Point, type Rect, type Wall } from '@vtt/shared';
import {
  Application,
  Container,
  CullerPlugin,
  extensions,
  Graphics,
  Rectangle,
  type FederatedPointerEvent,
} from 'pixi.js';
import { menuFor } from '../editor/menus.ts';
import { modsOf } from '../editor/selection.ts';
import type { Session } from '../session.ts';
import type { EditorTool } from '../session-editor.ts';
import { cuesOf } from '../feedback.ts';
import { ChunkLayer } from './ChunkLayer.ts';
import { CameraMotion } from './camera-motion.ts';
import { EffectsLayer } from './EffectsLayer.ts';
import { drawGrid } from './grid.ts';
import { FogBrush } from './FogBrush.ts';
import { listenToDrops } from './sidebar-drops.ts';
import { MapEditor } from './MapEditor.ts';
import { PathPreview } from './PathPreview.ts';
import { TokenLayer } from './TokenLayer.ts';
import { Vision } from './Vision.ts';

extensions.add(CullerPlugin);

const WHEEL_ZOOM_SPEED = 0.0015;
/** Below these zoom levels the matching detail is skipped, so a zoomed-out map stays cheap. */
const LOD = { labels: 0.45, doors: 0.25 };
/** Extra chunks loaded around the screen, so panning doesn't show holes. */
const CHUNK_MARGIN = 1;
/** Beyond this many chunks across, keep what's loaded instead of asking for more. */
const MAX_CHUNK_SPAN = 24;
const DRAG_THRESHOLD = 5;

interface Drag {
  start: Point;
  last: Point;
  /** When the pointer was last at `last`, for the speed of a fling. */
  at: number;
  panning: boolean;
  button: number;
  /** Set when the drag started on a token you control: dropping it walks the token there. */
  token?: string;
  moved?: boolean;
}

/**
 * The PixiJS map: an unbounded world split into chunks, streamed in around
 * the camera. Only what's on screen is drawn, and fine detail (grid, labels,
 * door handles) drops out as you zoom out.
 */
export class MapView {
  readonly app = new Application();
  private camera = new Container();
  /** Floor, grid and walls: lit, and hidden by fog of war. */
  private ground = new Container();
  /** Drawn above darkness and fog, with the same transform as the camera. */
  private overhead = new Container();
  private grid = new Graphics();
  private chunks: ChunkLayer;
  private tokens: TokenLayer;
  private effects: EffectsLayer;
  private preview = new PathPreview();
  private editor: MapEditor;
  private fogBrush: FogBrush;
  private vision?: Vision;
  /** The scene last shown, so a new one starts at its own camera start. */
  private shownScene?: string;

  /** World point at the centre of the screen. */
  private cam = new CameraMotion([0, 0], 0.6);
  private get center(): Point {
    return this.cam.center;
  }
  private get zoom(): number {
    return this.cam.zoom;
  }
  private dirty = true;
  private visionDirty = true;
  private cameraMoved = true;
  private wasWalking = false;
  /** A flickering light is on screen, so lighting is redrawn every frame. */
  private animatedLights = false;
  private viewId = '';
  /** The editor mode and tool last seen, to put away a half-drawn wall when they change. */
  private mode: EditorMode = 'tokens';
  private tool: EditorTool = 'select';
  private drag?: Drag;
  private hoverPoint?: Point;
  private unsubscribe: (() => void)[] = [];
  private destroyed = false;

  constructor(private session: Session) {
    this.chunks = new ChunkLayer(session);
    this.tokens = new TokenLayer(session);
    this.tokens.onGrab = (token, at) => {
      this.drag = { start: at, last: at, at: performance.now(), panning: false, button: 0, token };
    };
    this.editor = new MapEditor(session, (id) => this.tokens.placeOf(id));
    this.effects = new EffectsLayer(this.tokens, () => session.world?.gridSize ?? 100);
    this.fogBrush = new FogBrush(session);
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x1b1d22,
      antialias: true,
      // The lighting filter is written in GLSL.
      preference: 'webgl',
      autoDensity: true,
      resolution: devicePixelRatio,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    host.appendChild(this.app.canvas);
    this.ground.addChild(this.chunks.ground, this.grid, this.chunks.walls);
    this.camera.addChild(this.ground, this.tokens.container, this.effects.container);
    this.overhead.addChild(this.preview.container, this.effects.labels, this.editor.container, this.fogBrush.container);
    // Previews are drawn over tokens; clicks must still reach the tokens below.
    this.overhead.eventMode = 'none';
    this.vision = new Vision(this.app, this.session);
    this.ground.filters = [this.vision.mapFilter];
    this.tokens.container.filters = [this.vision.tokenFilter];
    this.app.stage.addChild(this.camera, this.overhead);
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
    stage.on('pointerupoutside', (e) => {
      // Let go over a panel or off the window: a drag in the editor still lands where the pointer is.
      if (this.fogBrush.up()) return;
      this.editor.pointerUp({ at: this.screenToWorld(e.global.x, e.global.y), button: e.button, mods: modsOf(e) });
      this.drag = undefined;
    });
    this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    // Right click opens our own menus; middle drag pans instead of the browser's auto-scroll.
    this.app.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    this.app.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault();
    });
    listenToDrops(this.app.canvas, this.session, (x, y) => this.screenToWorld(x, y));
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
        this.editor.redraw();
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
      s.on('selection', () => {
        this.tokens.redrawAll();
        this.editor.redraw();
      }),
      s.on('combat', () => {
        this.tokens.redrawAll();
        this.updatePreview(true);
      }),
      s.on('armed', () => {
        this.tokens.redrawAll();
        this.updatePreview(true);
      }),
      s.on('chat', (message) => {
        this.effects.play(cuesOf(message), performance.now());
      }),
      s.on('lighting', visionChanged),
      s.on('fog', visionChanged),
      s.on('editor', () => {
        this.onEditor();
        visionChanged();
      }),
      s.on('focus', (p) => {
        this.cam.glideTo(p);
        this.dirty = true;
      }),
    );
  }

  /** Outside the tokens mode, clicks go to the editor instead of tokens and doors. */
  private onEditor(): void {
    const editing = this.editor.active || this.fogBrush.active;
    this.tokens.container.eventMode = editing ? 'none' : 'passive';
    this.chunks.walls.eventMode = editing ? 'none' : 'passive';
    if (this.mode !== this.session.mode || this.tool !== this.session.tool) this.editor.cancel();
    this.mode = this.session.mode;
    this.tool = this.session.tool;
    this.editor.redraw();
    this.updatePreview(true);
  }

  private onWelcome(): void {
    const world = this.session.world;
    // A new scene (or the first) opens at its camera start.
    if (world && this.shownScene !== this.session.scene) {
      this.cam.jumpTo(world.start);
      this.shownScene = this.session.scene;
      this.viewId = '';
      this.dirty = true;
    }
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
    const now = performance.now();
    this.tokens.animateFeedback(now);
    this.effects.tick(now);
    if (!this.session.world) return;
    if (this.cam.step(dt)) this.dirty = true;
    // One more render after a walk ends, to mark what the token now sees as explored.
    const stopped = this.wasWalking && !walking;
    this.wasWalking = walking;
    if (this.dirty) this.applyCamera();
    if (this.visionDirty || this.cameraMoved || walking || stopped || this.animatedLights) {
      this.visionDirty = this.cameraMoved = false;
      const camera = { center: this.center, zoom: this.zoom };
      this.animatedLights = this.vision?.render(camera, this.allWalls(), this.tokens.viewers()) ?? false;
    }
  }

  private applyCamera(): void {
    this.dirty = false;
    this.cameraMoved = true;
    const { width, height } = this.app.screen;
    for (const layer of [this.camera, this.overhead]) {
      layer.scale.set(this.zoom);
      layer.position.set(width / 2 - this.center[0] * this.zoom, height / 2 - this.center[1] * this.zoom);
    }
    const view = this.visibleRect();
    this.session.viewRect = view;
    // Lighting covers the whole screen, even where nothing is drawn yet.
    this.ground.filterArea = new Rectangle(view.x, view.y, view.w, view.h);
    this.tokens.container.filterArea = this.ground.filterArea;
    this.requestChunks();
    drawGrid(this.grid, this.session.world!, view, this.zoom);
    this.editor.setZoom(this.zoom);
    this.fogBrush.setZoom(this.zoom);
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

  // Input -------------------------------------------------------------------

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    this.cam.zoomAt(this.cam.zoomGoal * Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED), [sx, sy], this.app.screen);
    this.dirty = true;
  };

  private onPointerDown(e: FederatedPointerEvent): void {
    const p: Point = [e.global.x, e.global.y];
    const at = this.screenToWorld(p[0], p[1]);
    if (e.button !== 2) this.session.closeMenu();
    // An aimed spell or readied attack keeps the left click for itself.
    const acting = !!(this.session.armed ?? this.session.aiming) && !this.editor.active;
    if (!acting && this.fogBrush.down(at, e.button)) return;
    if (!acting && this.editor.pointerDown({ at, button: e.button, mods: modsOf(e) })) return;
    this.drag = { start: p, last: p, at: performance.now(), panning: e.button === 1, button: e.button };
    this.cam.hold();
  }

  private onPointerMove(e: FederatedPointerEvent): void {
    const p: Point = [e.global.x, e.global.y];
    if (this.drag) this.dragTo(this.drag, p);
    this.hoverPoint = this.screenToWorld(p[0], p[1]);
    this.session.pointer = this.hoverPoint;
    this.editor.pointerMove(this.hoverPoint, modsOf(e));
    this.fogBrush.move(this.hoverPoint);
    this.updatePreview(false);
  }

  /** Right and middle drags pan; a token drag waits for the drop. */
  private dragTo(drag: Drag, p: Point): void {
    const far = Math.hypot(p[0] - drag.start[0], p[1] - drag.start[1]) > DRAG_THRESHOLD;
    if (far) drag.moved = true;
    if (drag.token) return;
    if (far && drag.button !== 0) drag.panning = true;
    const now = performance.now();
    if (drag.panning) {
      this.cam.drag([p[0] - drag.last[0], p[1] - drag.last[1]], (now - drag.at) / 1000);
      this.dirty = true;
    }
    drag.last = p;
    drag.at = now;
  }

  private onPointerUp(e: FederatedPointerEvent): void {
    const at = this.screenToWorld(e.global.x, e.global.y);
    if (this.fogBrush.up()) return;
    this.editor.pointerUp({ at, button: e.button, mods: modsOf(e) });
    const drag = this.drag;
    this.drag = undefined;
    if (!drag) return;
    if (drag.token) return this.dropToken(drag, at);
    if (drag.panning) return this.letGo(drag);
    if (drag.button === 2 && !drag.moved) return this.rightClick([e.global.x, e.global.y], at);
    if (drag.button === 0 && !drag.moved) this.clickGround(at);
  }

  /** A token let go: a drag walks it (and the rest of the selection) there, a click selects it alone. */
  private dropToken(drag: Drag, at: Point): void {
    const s = this.session;
    const id = drag.token!;
    if (!drag.moved) return s.select(id);
    const from = s.tokens.get(id);
    if (!from) return;
    const [dx, dy] = [at[0] - from.x, at[1] - from.y];
    for (const t of s.tokens.values())
      if (t.id !== id && s.isSelected(t.id) && s.canControl(t)) s.move(t.id, [t.x + dx, t.y + dy]);
    s.move(id, at);
  }

  /**
   * A right click that didn't pan: puts away a half-drawn wall, an aimed
   * spell or a readied attack; otherwise opens the menu of what is under the
   * pointer (or of the ground).
   */
  private rightClick(screen: Point, at: Point): void {
    if (this.editor.cancel() || this.session.cancelAction()) return;
    const target = this.editor.menuTarget(at);
    const rect = this.app.canvas.getBoundingClientRect();
    this.session.openMenu([screen[0] + rect.left, screen[1] + rect.top], menuFor(target, this.session));
  }

  /** A fling glides on; a drag that stopped before letting go stays put. */
  private letGo(drag: Drag): void {
    if (performance.now() - drag.at < 80) this.cam.release();
  }

  /** A left click on the map with an action ready: casts an aimed area spell, or puts the action away. */
  private clickGround(p: Point): void {
    if (this.session.armed) return this.session.arm(undefined);
    const aiming = this.session.aiming;
    if (aiming?.mode === 'point') return this.session.castAt(p);
    if (aiming) this.session.aim(undefined);
  }

  /** The token whose path shows: while it is dragged, or aiming a spell or attack. */
  private pathToken() {
    const s = this.session;
    const showing = !!(this.drag?.token ?? s.armed ?? s.aiming) && !this.drag?.panning;
    return showing && s.selected ? s.tokens.get(s.selected) : undefined;
  }

  private updatePreview(force: boolean): void {
    const world = this.session.world;
    const token = this.pathToken();
    if (!world || !token || !this.hoverPoint) {
      this.preview.clear();
      return;
    }
    const ctx = { gridSize: world.gridSize, walls: this.allWalls(), zoom: this.zoom, force };
    const attack = token.sheet?.attacks.find((a) => a.name === this.session.armed);
    const aiming = this.session.aiming;
    if (aiming) this.preview.showSpell(token, this.hoverPoint, aiming, ctx);
    else if (attack) this.preview.showAttack(token, this.hoverPoint, attack, ctx);
    else this.preview.show(token, this.hoverPoint, { ...ctx, budget: this.session.movementLeft(token.id) });
  }
}

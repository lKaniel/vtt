import { type EditorMode, onLevel, type Point, type Rect, type Wall } from '@vtt/shared';
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
import type { Session } from '../session/session.ts';
import type { EditorTool } from '../session/session-editor.ts';
import { cuesOf } from '../feedback.ts';
import { currentMotion } from '../play/animations.ts';
import { ChunkLayer } from './ChunkLayer.ts';
import { CameraMotion } from './camera-motion.ts';
import { EffectsLayer } from './EffectsLayer.ts';
import { chunksInView, drawGrid } from './grid.ts';
import { MapBrushes } from './MapBrushes.ts';
import { ItemLayer } from './ItemLayer.ts';
import { dropToken, listenToDrops, openNote } from './sidebar-drops.ts';
import { clickGround } from '../play/interact.ts';
import { MapEditor } from './MapEditor.ts';
import { PathPreview, showPreview } from './PathPreview.ts';
import { PresenceLayer } from './PresenceLayer.ts';
import { RulerLayer } from './RulerLayer.ts';
import { TokenLayer } from './TokenLayer.ts';
import { WeatherLayer } from './WeatherLayer.ts';
import { Vision } from './Vision.ts';
import { spaceKey } from '../play/space-pan.ts';
import { previewToken } from '../play/walking.ts';
import { listenToWheel } from './wheel-zoom.ts';
import { MapTouch } from './map-touch.ts';
import { type Drag, dragTo, letGo, pressAt } from './map-drag.ts';

extensions.add(CullerPlugin);

/** Below these zoom levels the matching detail is skipped, so a zoomed-out map stays cheap. */
const LOD = { labels: 0.45, doors: 0.25 };
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
  readonly tokens: TokenLayer;
  readonly effects: EffectsLayer;
  /** The walk, attack and spell previews; the 3D view draws them again (view3d/overlay3d.ts). */
  readonly preview = new PathPreview();
  readonly editor: MapEditor;
  private brushes: MapBrushes;
  private items: ItemLayer;
  private rulers: RulerLayer;
  private presence: PresenceLayer;
  private weather: WeatherLayer;
  private vision?: Vision;
  /** The scene last shown, so a new one starts at its own camera start. */
  private shownScene?: string;

  /** World point at the centre of the screen. */
  readonly cam = new CameraMotion([0, 0], 0.6);
  private get center(): Point {
    return this.cam.center;
  }
  private get zoom(): number {
    return this.cam.zoom;
  }
  /** The camera moved: set it when something else (the 3D view) moves `cam`. */
  dirty = true;
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
  private touch?: MapTouch;
  /** Under the 3D view, which steers its own camera from two fingers (view3d/pixi-bridge.ts). */
  bridged = false;
  private hoverPoint?: Point;
  private unsubscribe: (() => void)[] = [];
  private destroyed = false;

  constructor(private session: Session) {
    this.chunks = new ChunkLayer(session, (id) => this.tokens.placeOf(id));
    this.tokens = new TokenLayer(session);
    this.tokens.onGrab = (token, at) => {
      this.drag = pressAt(at, 0, { token });
    };
    this.editor = new MapEditor(session, (id) => this.tokens.placeOf(id));
    this.effects = new EffectsLayer(this.tokens, () => session.world?.gridSize ?? 100);
    this.brushes = new MapBrushes(session);
    this.items = new ItemLayer(session);
    this.rulers = new RulerLayer(session);
    this.presence = new PresenceLayer(session, (id) => this.tokens.placeOf(id));
    this.weather = new WeatherLayer(session);
  }

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      resizeTo: host,
      background: 0x1b1d22,
      backgroundAlpha: 0, // the canvas keeps alpha: see Vision.seeThrough
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
    this.ground.addChild(this.chunks.ground, this.grid, this.items.container, this.chunks.walls);
    this.camera.addChild(this.ground, this.tokens.container, this.chunks.roofs, this.effects.container);
    this.overhead.addChild(this.preview.container, this.effects.labels, this.editor.container, this.brushes.container);
    this.overhead.addChild(this.rulers.container, this.presence.container);
    // Previews are drawn over tokens; clicks must still reach the tokens below.
    this.overhead.eventMode = 'none';
    this.vision = new Vision(this.app, this.session);
    this.ground.filters = [this.vision.mapFilter];
    this.tokens.container.filters = [this.vision.tokenFilter];
    this.chunks.roofs.filters = [this.vision.roofFilter];
    this.app.stage.addChild(this.camera, this.weather.container, this.overhead);
    this.listenToInput();
    this.listenToSession();
    this.unsubscribe.push(this.presence.attach(this.app.canvas));
    this.app.ticker.add((t) => this.tick(t.deltaMS / 1000));
    this.tokens.redrawAll();
  }

  /** The map whose pieces stay loaded instead of what the camera sees: the 3D view's (view3d/frame-budget.ts). */
  chunkArea?: Rect;

  /** Under the 3D view, empty ground shows what lies below it (view3d/pixi-bridge.ts). */
  // fallow-ignore-next-line unused-class-member -- the 3D view calls it through its FlatMap type
  readonly seeThrough = (on: boolean): void => this.vision?.seeThrough(on);

  destroy(): void {
    this.destroyed = true;
    for (const off of this.unsubscribe) off();
    this.vision?.destroy();
    this.chunks.destroy();
    if ((this.app.renderer as unknown) !== undefined) {
      this.app.destroy(true, { children: true });
    }
  }

  private listenToInput(): void {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    this.touch = new MapTouch(this.app, this.cam, {
      steers: () => !this.bridged,
      dropPress: () => {
        this.drag = undefined;
        this.editor.dropPress();
      },
      menu: (client, p) => this.rightClick(client, this.screenToWorld(p[0], p[1])),
      moved: () => (this.dirty = true),
    });
    stage.on('pointerdown', (e) => this.onPointerDown(e));
    stage.on('globalpointermove', (e) => this.onPointerMove(e));
    stage.on('pointerup', (e) => this.onPointerUp(e));
    stage.on('pointerupoutside', (e) => {
      // Let go over a panel or off the window: a drag in the editor still lands where the pointer is.
      if (this.touch?.up(e) || this.presence.up() || this.brushes.up()) return;
      this.editor.pointerUp({ at: this.screenToWorld(e.global.x, e.global.y), button: e.button, mods: modsOf(e) });
      this.drag = undefined;
    });
    this.unsubscribe.push(listenToWheel(this.app.canvas, this.cam, this.app.screen, () => (this.dirty = true)));
    listenToDrops(this.app.canvas, this.session, (x, y) => this.screenToWorld(x, y));
    // Off the map (or onto a panel over it), the GM's pointer peeks under no roof.
    this.app.canvas.addEventListener('pointerleave', () => (this.session.pointer = undefined));
    this.app.renderer.on('resize', () => {
      this.vision?.resize();
      this.dirty = this.visionDirty = true;
    });
  }

  private listenToSession(): void {
    const s = this.session;
    const visionChanged = () => (this.visionDirty = true);
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
        this.effects.play(cuesOf(message, currentMotion()), performance.now());
      }),
      s.on('rulers', () => {
        this.rulers.redraw();
      }),
      s.on('lighting', visionChanged),
      s.on('fog', visionChanged),
      s.on('editor', () => {
        this.items.redraw();
        this.onEditor();
        visionChanged();
      }),
      s.on('focus', (p, gently) => {
        if (!gently || !this.cam.sees(p, this.app.screen)) this.cam.glideTo(p);
        this.dirty = true;
      }),
    );
  }

  /** Outside the tokens mode, clicks go to the editor instead of tokens and doors. */
  private onEditor(): void {
    const editing = this.editor.active || this.brushes.active;
    this.tokens.container.eventMode = editing ? 'none' : 'passive';
    this.chunks.walls.eventMode = editing ? 'none' : 'passive';
    this.chunks.ground.eventMode = editing ? 'none' : 'passive';
    if (this.mode !== this.session.editor.mode || this.tool !== this.session.editor.tool) this.editor.cancel();
    this.mode = this.session.editor.mode;
    this.tool = this.session.editor.tool;
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
    this.items.redraw();
    this.tokens.redrawAll();
  }

  private wallsChanged(): void {
    this.vision?.wallsChanged();
    this.visionDirty = true;
    this.dirty = true;
    this.updatePreview(true);
  }

  /** Another floor is shown: its tiles, walls and items. */
  private floorChanged(): void {
    this.wallsChanged();
    this.items.redraw();
    this.tokens.redrawAll();
  }

  /** The walls on the level shown (and those on every level). */
  private allWalls(): Wall[] {
    const level = this.session.levels.current;
    return [...this.session.chunks.values()].flatMap((c) => c.walls.filter((w) => onLevel(w, level)));
  }

  // Frame -------------------------------------------------------------------

  private tick(dt: number): void {
    const walking = this.tokens.animate(dt);
    const now = performance.now();
    this.tokens.animateFeedback(now);
    this.effects.tick(now);
    this.presence.tick(dt, now);
    this.chunks.tick(dt, () => this.floorChanged());
    this.weather.tick(dt, this.app.screen);
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
    this.session.editor.viewRect = view;
    // Lighting covers the whole screen, even where nothing is drawn yet; tokens and roofs only where they are.
    this.ground.filterArea = new Rectangle(view.x, view.y, view.w, view.h);
    this.chunks.setView(view, this.zoom, this.app.renderer);
    this.requestChunks();
    drawGrid(this.grid, this.session.world!, view, this.zoom);
    this.editor.setZoom(this.zoom);
    this.items.setZoom(this.zoom);
    this.brushes.setZoom(this.zoom);
    this.rulers.setZoom(this.zoom);
    this.presence.setZoom(this.zoom);
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
    const keys = chunksInView(this.chunkArea ?? this.visibleRect(), this.session.world!.chunkSize);
    if (!keys) return;
    const id = keys.join(' ');
    if (id === this.viewId) return;
    this.viewId = id;
    this.session.setView(keys);
  }

  // Input -------------------------------------------------------------------

  private onPointerDown(e: FederatedPointerEvent): void {
    // A finger on open ground drags the map, and is the press it stands for if it lifts where it landed.
    if (!this.touch?.pansFrom(e) || this.editor.active || this.brushes.active) return this.press(e);
    this.session.editor.closeMenu();
    this.drag = pressAt([e.global.x, e.global.y], 0, { tap: true });
    this.cam.hold();
  }

  private press(e: FederatedPointerEvent): void {
    const p: Point = [e.global.x, e.global.y];
    const at = this.screenToWorld(p[0], p[1]);
    if (e.button !== 2) this.session.editor.closeMenu();
    if (this.grabMap(e, p)) return;
    this.presence.down(p, at, e);
    // An aimed spell or readied attack keeps the left click for itself.
    const acting = !!(this.session.actions.armed ?? this.session.actions.aiming) && !this.editor.active;
    if (!acting && this.brushes.down(at, e.button, e.shiftKey)) return;
    if (!acting && e.button === 0 && openNote(this.session, this.items, at)) return;
    if (!acting && this.editor.pointerDown({ at, button: e.button, mods: modsOf(e) })) return;
    this.drag = pressAt(p, e.button);
    this.cam.hold();
  }

  /** Space held: a left drag pans, whatever is under the pointer. */
  private grabMap(e: FederatedPointerEvent, p: Point): boolean {
    if (e.button !== 0 || !spaceKey.held) return false;
    spaceKey.panned();
    this.drag = pressAt(p, 0, { panning: true });
    this.cam.hold();
    return true;
  }

  private onPointerMove(e: FederatedPointerEvent): void {
    if (this.touch?.move(e)) return;
    const p: Point = [e.global.x, e.global.y];
    if (this.drag && dragTo(this.drag, p, this.cam)) this.dirty = true;
    this.hoverPoint = this.screenToWorld(p[0], p[1]);
    this.session.pointer = this.hoverPoint;
    this.presence.move(p, this.hoverPoint);
    this.editor.pointerMove(this.hoverPoint, modsOf(e));
    this.brushes.move(this.hoverPoint, e.shiftKey);
    this.updatePreview(false);
  }

  private onPointerUp(e: FederatedPointerEvent): void {
    if (this.touch?.up(e)) return;
    if (this.drag?.tap && !this.drag.moved) this.press(e);
    const at = this.screenToWorld(e.global.x, e.global.y);
    if (this.brushes.up()) return;
    this.editor.pointerUp({ at, button: e.button, mods: modsOf(e) });
    const drag = this.drag;
    this.drag = undefined;
    if (this.presence.up() || !drag) return;
    this.endDrag(drag, e, at);
  }

  /** A press let go: a token drop, the end of a pan, or a click. */
  private endDrag(drag: Drag, e: FederatedPointerEvent, at: Point): void {
    if (drag.token) return dropToken(this.session, drag.token, drag.moved ? at : undefined);
    if (drag.panning) return letGo(drag, this.cam);
    if (drag.button === 2 && !drag.moved) return this.rightClick([e.client.x, e.client.y], at);
    if (drag.button === 0 && !drag.moved) clickGround(this.session, at);
  }

  /**
   * A right click that didn't pan: puts away a half-drawn wall, an aimed
   * spell or a readied attack; otherwise opens the menu of what is under the
   * pointer (or of the ground).
   */
  private rightClick(onScreen: Point, at: Point): void {
    if (this.editor.finish() || this.editor.cancel() || this.brushes.putDown() || this.session.actions.cancelAction())
      return;
    const target = { ...this.editor.menuTarget(at), screen: onScreen };
    this.session.editor.openMenu(onScreen, menuFor(target, this.session));
  }

  private updatePreview(force: boolean): void {
    const drag = this.drag && { token: !!this.drag.token, panning: this.drag.panning };
    const at = { hover: this.hoverPoint, drag, editing: this.editor.active };
    const token = previewToken(this.session, at);
    if (!token || !this.hoverPoint) return this.preview.clear();
    showPreview(this.preview, this.session, {
      token,
      hover: this.hoverPoint,
      walls: this.session.throughWalls.on ? [] : [...this.session.chunks.values()].flatMap((c) => c.walls),
      zoom: this.zoom,
      force,
    });
  }
}

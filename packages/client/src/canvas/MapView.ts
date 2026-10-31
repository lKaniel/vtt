import { chunkKey, findPath, snapToGrid, type Chunk, type Point, type Token, type Wall } from '@vtt/shared';
import { Application, Assets, Container, CullerPlugin, extensions, Graphics, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import type { Session } from '../session.ts';

extensions.add(CullerPlugin);

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;
/** Below these zoom levels the matching detail is skipped, so a zoomed-out map stays cheap. */
const LOD = { grid: 0.35, labels: 0.45, doors: 0.25 };
/** Extra chunks loaded around the screen, so panning doesn't show holes. */
const CHUNK_MARGIN = 1;
/** Token walking speed when animating a move, pixels per second. */
const WALK_SPEED = 900;
const DRAG_THRESHOLD = 5;

const DOOR_COLORS = { closed: 0xd08a3a, open: 0x7ac06a, locked: 0xd04a4a } as const;

interface ChunkView {
  ground: Container;
  walls: Container;
}

interface TokenView {
  root: Container;
  disc: Graphics;
  label: Text;
  /** Remaining points of an animated move. */
  route: Point[];
}

/**
 * The PixiJS map: an unbounded world split into chunks, streamed in around
 * the camera. Only what's on screen is drawn, and fine detail (grid, labels,
 * door handles) drops out as you zoom out.
 */
export class MapView {
  readonly app = new Application();
  private camera = new Container();
  private groundLayer = new Container();
  private gridLayer = new Graphics();
  private wallLayer = new Container();
  private tokenLayer = new Container();
  private pathLayer = new Graphics();
  private pathLabel = new Text({ text: '', style: { fill: 0xffffff, fontSize: 28, fontWeight: '600', stroke: { color: 0x000000, width: 5 } } });
  private chunkViews = new Map<string, ChunkView>();
  private tokenViews = new Map<string, TokenView>();

  /** World point at the centre of the screen. */
  private center: Point = [0, 0];
  private zoom = 0.6;
  private dirty = true;
  private drag?: { start: Point; last: Point; panning: boolean; button: number };
  private hoverSquare?: string;
  private hoverPoint?: Point;
  private unsubscribe: (() => void)[] = [];
  private destroyed = false;

  constructor(private session: Session) {}

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, background: 0x1b1d22, antialias: true, autoDensity: true, resolution: devicePixelRatio });
    if (this.destroyed) return this.app.destroy(true);
    host.appendChild(this.app.canvas);
    this.camera.addChild(this.groundLayer, this.gridLayer, this.wallLayer, this.pathLayer, this.tokenLayer, this.pathLabel);
    this.app.stage.addChild(this.camera);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.pathLabel.anchor.set(0.5, 1.4);

    this.app.stage.on('pointerdown', (e) => this.onPointerDown(e));
    this.app.stage.on('globalpointermove', (e) => this.onPointerMove(e));
    this.app.stage.on('pointerup', (e) => this.onPointerUp(e));
    this.app.stage.on('pointerupoutside', () => (this.drag = undefined));
    this.app.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.app.renderer.on('resize', () => (this.dirty = true));
    this.app.ticker.add((t) => this.tick(t.deltaMS / 1000));

    const s = this.session;
    this.unsubscribe.push(
      s.on('welcome', () => {
        if (s.world && !this.viewId) this.center = [...s.world.start];
        for (const key of [...this.chunkViews.keys()]) this.removeChunk(key);
        this.dirty = true;
      }),
      s.on('chunk', (key) => this.drawChunk(key)),
      s.on('chunkGone', (key) => this.removeChunk(key)),
      s.on('token', (t) => this.drawToken(t)),
      s.on('tokenGone', (id) => this.removeToken(id)),
      s.on('moved', (id, path) => this.animate(id, path)),
      s.on('select', () => {
        for (const t of s.tokens.values()) this.drawToken(t);
        this.updatePreview(true);
      }),
      s.on('focus', (p) => {
        this.center = [...p];
        this.dirty = true;
      }),
    );
    for (const t of s.tokens.values()) this.drawToken(t);
  }

  destroy(): void {
    this.destroyed = true;
    for (const off of this.unsubscribe) off();
    if (this.app.renderer) {
      this.app.canvas.removeEventListener('wheel', this.onWheel);
      this.app.destroy(true, { children: true });
    }
  }

  // Camera ------------------------------------------------------------------

  private screenToWorld(x: number, y: number): Point {
    const { width, height } = this.app.screen;
    return [this.center[0] + (x - width / 2) / this.zoom, this.center[1] + (y - height / 2) / this.zoom];
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * Math.exp(-e.deltaY * 0.0015)));
    const after = this.screenToWorld(sx, sy);
    this.center = [this.center[0] + before[0] - after[0], this.center[1] + before[1] - after[1]];
    this.dirty = true;
  };

  private tick(dt: number): void {
    this.animateTokens(dt);
    if (!this.dirty || !this.session.world) return;
    this.dirty = false;
    const { width, height } = this.app.screen;
    this.camera.scale.set(this.zoom);
    this.camera.position.set(width / 2 - this.center[0] * this.zoom, height / 2 - this.center[1] * this.zoom);
    this.requestChunks();
    this.drawGrid();
    const showLabels = this.zoom >= LOD.labels;
    for (const v of this.tokenViews.values()) v.label.visible = showLabels;
    for (const v of this.chunkViews.values()) {
      for (const child of v.walls.children) if (child.label === 'door') child.visible = this.zoom >= LOD.doors;
    }
  }

  private visibleRect() {
    const [x0, y0] = this.screenToWorld(0, 0);
    const [x1, y1] = this.screenToWorld(this.app.screen.width, this.app.screen.height);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  private requestChunks(): void {
    const size = this.session.world!.chunkSize;
    const r = this.visibleRect();
    const keys: string[] = [];
    const cx0 = Math.floor(r.x / size) - CHUNK_MARGIN;
    const cy0 = Math.floor(r.y / size) - CHUNK_MARGIN;
    const cx1 = Math.floor((r.x + r.w) / size) + CHUNK_MARGIN;
    const cy1 = Math.floor((r.y + r.h) / size) + CHUNK_MARGIN;
    // Very far out we'd ask for hundreds of chunks; keep what's loaded instead.
    if (Math.max(cx1 - cx0, cy1 - cy0) > 24) return;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) keys.push(chunkKey(cx, cy));
    const id = keys.join(' ');
    if (id === this.viewId) return;
    this.viewId = id;
    this.session.setView(keys);
  }
  private viewId = '';

  private drawGrid(): void {
    const g = this.gridLayer;
    g.clear();
    if (this.zoom < LOD.grid) return;
    const size = this.session.world!.gridSize;
    const r = this.visibleRect();
    const x0 = Math.floor(r.x / size) * size;
    const y0 = Math.floor(r.y / size) * size;
    for (let x = x0; x <= r.x + r.w; x += size) g.moveTo(x, r.y).lineTo(x, r.y + r.h);
    for (let y = y0; y <= r.y + r.h; y += size) g.moveTo(r.x, y).lineTo(r.x + r.w, y);
    g.stroke({ width: 1 / this.zoom, color: 0x000000, alpha: 0.18 });
  }

  // Chunks ------------------------------------------------------------------

  private drawChunk(key: string): void {
    const chunk = this.session.chunks.get(key);
    if (!chunk) return;
    this.removeChunk(key);
    const view: ChunkView = { ground: new Container(), walls: new Container() };
    view.ground.cullable = true;
    view.walls.cullable = true;
    this.drawTiles(view.ground, chunk);
    this.drawWalls(view.walls, key, chunk.walls);
    this.groundLayer.addChild(view.ground);
    this.wallLayer.addChild(view.walls);
    this.chunkViews.set(key, view);
    this.dirty = true;
    this.updatePreview(true);
  }

  private removeChunk(key: string): void {
    const v = this.chunkViews.get(key);
    if (!v) return;
    v.ground.destroy({ children: true });
    v.walls.destroy({ children: true });
    this.chunkViews.delete(key);
  }

  private drawTiles(into: Container, chunk: Chunk): void {
    const rects = new Graphics();
    into.addChild(rects);
    for (const tile of chunk.tiles) {
      if (tile.kind === 'rect') {
        rects.rect(tile.x, tile.y, tile.w, tile.h).fill(tile.color);
        continue;
      }
      const sprite = new Sprite();
      sprite.position.set(tile.x, tile.y);
      into.addChild(sprite);
      Assets.load(`/assets/${tile.src}`)
        .then((texture) => {
          if (sprite.destroyed) return;
          sprite.texture = texture;
          sprite.width = tile.w;
          sprite.height = tile.h;
        })
        .catch(() => console.warn(`Missing image assets/${tile.src}`));
    }
  }

  private drawWalls(into: Container, key: string, walls: Wall[]): void {
    const lines = new Graphics();
    into.addChild(lines);
    for (const w of walls) {
      if (w.door) continue;
      lines.moveTo(...w.a).lineTo(...w.b);
    }
    lines.stroke({ width: 10, color: 0x111111, cap: 'round' });
    const isGm = this.session.you?.role === 'gm';
    for (const w of walls) {
      if (!w.door) continue;
      const color = DOOR_COLORS[w.door];
      const door = new Graphics();
      door.label = 'door';
      door.moveTo(...w.a).lineTo(...w.b).stroke({ width: w.door === 'open' ? 4 : 10, color, alpha: w.door === 'open' ? 0.6 : 1 });
      const mid: Point = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
      door.circle(mid[0], mid[1], 16).fill({ color: 0x1b1d22, alpha: 0.85 }).stroke({ width: 4, color });
      door.eventMode = 'static';
      door.cursor = 'pointer';
      door.on('pointertap', (e) => {
        e.stopPropagation();
        // Shift-click lets the GM lock or unlock.
        if (isGm && e.shiftKey) this.session.setDoor(key, w.id, w.door === 'locked' ? 'closed' : 'locked');
        else if (w.door === 'locked') this.session.showError('The door is locked');
        else this.session.setDoor(key, w.id, w.door === 'open' ? 'closed' : 'open');
      });
      door.on('pointerdown', (e) => e.stopPropagation());
      into.addChild(door);
    }
  }

  private allWalls(): Wall[] {
    const out: Wall[] = [];
    for (const c of this.session.chunks.values()) out.push(...c.walls);
    return out;
  }

  // Tokens ------------------------------------------------------------------

  private drawToken(token: Token): void {
    const g = this.session.world?.gridSize ?? 100;
    let view = this.tokenViews.get(token.id);
    if (!view) {
      const root = new Container();
      const disc = new Graphics();
      const label = new Text({ text: '', style: { fill: 0xffffff, fontSize: 22, stroke: { color: 0x000000, width: 4 } } });
      label.anchor.set(0.5, 0);
      root.addChild(disc, label);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointerdown', (e) => {
        e.stopPropagation();
        const t = this.session.tokens.get(token.id);
        if (t && this.session.canControl(t)) this.session.select(t.id);
      });
      root.position.set(token.x, token.y);
      this.tokenLayer.addChild(root);
      view = { root, disc, label, route: [] };
      this.tokenViews.set(token.id, view);
    }
    if (view.route.length === 0) view.root.position.set(token.x, token.y);
    const r = token.size * g * 0.42;
    const selected = this.session.selected === token.id;
    const mine = this.session.you && token.controllers.includes(this.session.you.id);
    view.disc
      .clear()
      .circle(0, 0, r)
      .fill(token.color)
      .stroke({ width: selected ? 8 : 4, color: selected ? 0xffffff : mine ? this.session.you!.color : 0x111111 });
    const notes = [token.hidden && 'hidden', token.visibleTo && 'illusion'].filter(Boolean);
    view.label.text = notes.length ? `${token.name} (${notes.join(', ')})` : token.name;
    view.label.position.set(0, r + 4);
    view.label.visible = this.zoom >= LOD.labels;
    view.root.alpha = token.hidden ? 0.5 : 1;
  }

  private removeToken(id: string): void {
    this.tokenViews.get(id)?.root.destroy({ children: true });
    this.tokenViews.delete(id);
  }

  private animate(id: string, path: Point[]): void {
    const view = this.tokenViews.get(id);
    if (!view) return;
    view.route = path.slice(1);
    this.updatePreview(true);
  }

  private animateTokens(dt: number): void {
    for (const v of this.tokenViews.values()) {
      let budget = WALK_SPEED * dt;
      while (budget > 0 && v.route.length > 0) {
        const [tx, ty] = v.route[0]!;
        const dx = tx - v.root.x;
        const dy = ty - v.root.y;
        const d = Math.hypot(dx, dy);
        if (d <= budget) {
          v.root.position.set(tx, ty);
          v.route.shift();
          budget -= d;
        } else {
          v.root.position.set(v.root.x + (dx / d) * budget, v.root.y + (dy / d) * budget);
          budget = 0;
        }
      }
    }
  }

  // Input -------------------------------------------------------------------

  private onPointerDown(e: FederatedPointerEvent): void {
    const p: Point = [e.global.x, e.global.y];
    this.drag = { start: p, last: p, panning: e.button !== 0, button: e.button };
  }

  private onPointerMove(e: FederatedPointerEvent): void {
    const p: Point = [e.global.x, e.global.y];
    if (this.drag) {
      if (!this.drag.panning && Math.hypot(p[0] - this.drag.start[0], p[1] - this.drag.start[1]) > DRAG_THRESHOLD) {
        this.drag.panning = true;
      }
      if (this.drag.panning) {
        this.center = [
          this.center[0] - (p[0] - this.drag.last[0]) / this.zoom,
          this.center[1] - (p[1] - this.drag.last[1]) / this.zoom,
        ];
        this.dirty = true;
      }
      this.drag.last = p;
    }
    this.hoverPoint = this.screenToWorld(p[0], p[1]);
    this.updatePreview(false);
  }

  private onPointerUp(e: FederatedPointerEvent): void {
    const drag = this.drag;
    this.drag = undefined;
    if (!drag || drag.panning || drag.button !== 0) return;
    const token = this.session.selected ? this.session.tokens.get(this.session.selected) : undefined;
    if (!token) return;
    this.session.move(token.id, this.screenToWorld(e.global.x, e.global.y));
  }

  /** Shows the path the selected token would walk to the hovered square. */
  private updatePreview(force: boolean): void {
    const world = this.session.world;
    const token = this.session.selected ? this.session.tokens.get(this.session.selected) : undefined;
    const g = this.pathLayer;
    if (!world || !token || !this.hoverPoint || this.drag?.panning) {
      g.clear();
      this.pathLabel.text = '';
      this.hoverSquare = undefined;
      return;
    }
    const target = snapToGrid(this.hoverPoint, world.gridSize);
    const square = `${target[0]},${target[1]}:${token.x},${token.y}`;
    if (!force && square === this.hoverSquare) return;
    this.hoverSquare = square;
    g.clear();
    this.pathLabel.text = '';
    const path = findPath([token.x, token.y], target, this.allWalls(), { gridSize: world.gridSize });
    if (!path) {
      g.circle(target[0], target[1], world.gridSize * 0.3).stroke({ width: 6, color: 0xd04a4a });
      return;
    }
    if (path.points.length < 2) return;
    const color = path.feet > token.speed ? 0xff8060 : 0xffffff;
    g.moveTo(...path.points[0]!);
    for (const p of path.points.slice(1)) g.lineTo(...p);
    g.stroke({ width: 6, color, alpha: 0.8, cap: 'round', join: 'round' });
    for (const p of path.points.slice(1, -1)) g.circle(p[0], p[1], 6).fill({ color, alpha: 0.8 });
    g.circle(target[0], target[1], world.gridSize * 0.3).stroke({ width: 6, color });
    this.pathLabel.text = `${path.feet} ft`;
    this.pathLabel.style.fill = color;
    this.pathLabel.position.set(target[0], target[1] - world.gridSize * 0.3);
    this.pathLabel.scale.set(Math.max(1, 0.8 / this.zoom));
  }
}

import type { Doc } from '@vtt/core';
import {
  handlesOf,
  type Hittable,
  hitTest,
  marqueeHits,
  type MarqueeMode,
  type Point,
  type Rect,
  shapeOf,
  type View,
  withGroupBounds,
} from '@vtt/shared';
import { Container, Graphics } from 'pixi.js';
import { EditorController, type EditorHost } from '../editor/controller.ts';
import type { MenuTarget } from '../editor/menus.ts';
import { previewDoc, previewTiles } from '../editor/preview.ts';
import { keyOf, refOf, type Mods } from '../editor/selection.ts';
import { TileItems } from '../editor/tile-items.ts';
import type { Session } from '../session.ts';
import { dragsFreely } from '../walking.ts';
import { DrawTools } from './DrawTools.ts';
import { drawHandles, drawLight, drawMarquee, drawOutline, drawWall, type DrawCtx } from './editor-draw.ts';

/** How close (screen pixels) the pointer must be to pick a wall, light or handle. */
const PICK_PX = 10;
const HANDLE_PX = 9;
/** Screen pixels a press may wander before it is a drag. */
const SLOP_PX = 5;

export interface PointerInfo {
  at: Point;
  button: number;
  mods: Mods;
}

type TokenPlace = (id: string) => { at: Point; r: number } | undefined;

/**
 * The map editor on the canvas, for every mode: click and marquee
 * selection, dragging the selection or its handles, the drawing tools, and
 * the overlay that shows walls, lights, the selection and the marquee. The
 * gestures themselves are in editor/controller.ts; this class says what is
 * where and draws it.
 */
export class MapEditor {
  readonly container = new Container();
  private g = new Graphics();
  private controller: EditorController;
  private tools: DrawTools;
  private hover?: Point;
  private free = false;
  private zoom = 1;

  constructor(
    private session: Session,
    private tokenPlace: TokenPlace,
  ) {
    this.container.addChild(this.g);
    this.container.eventMode = 'none';
    this.controller = new EditorController(this.host());
    this.tools = new DrawTools(session);
  }

  /** A mode other than tokens is in use: the map's own clicks (tokens, doors) step aside. */
  get active(): boolean {
    return this.session.mode !== 'tokens';
  }

  private get measuring(): boolean {
    return this.session.mode === 'templates' && this.session.tool === 'ruler';
  }

  /** Puts away a half-drawn wall, a drag or your ruler; true if there was one. */
  cancel(): boolean {
    const had = this.session.rulers.clear() || this.tools.busy || this.controller.busy;
    this.tools.cancel();
    this.controller.cancel();
    this.redraw();
    return had;
  }

  /** Ends a line, polygon or region being drawn, or takes back the ruler's last waypoint; true if there was one. */
  finish(): boolean {
    if (this.measuring) return this.session.rulers.back();
    const done = this.tools.finish();
    this.redraw();
    return done;
  }

  /** A left press: true when the editor took it. */
  pointerDown(p: PointerInfo): boolean {
    if (p.button !== 0) return false;
    this.session.closeMenu();
    if (this.measuring) this.session.rulers.press(this.rulerPoint(p.at));
    else if (this.tools.drawing) this.tools.press(p.at, p.mods.shift);
    else this.controller.down(p.at, p.mods);
    this.redraw();
    return true;
  }

  pointerMove(at: Point, mods: Mods): void {
    this.hover = at;
    this.free = mods.shift;
    if (this.measuring) this.session.rulers.hover(at);
    this.controller.move(at, this.dragMods(mods));
    if (this.tools.busy) this.tools.drag(at);
    if (this.active || this.controller.busy) this.redraw();
  }

  pointerUp(p: PointerInfo): void {
    if (p.button !== 0) return;
    if (this.tools.busy) this.tools.release(p.at, p.mods.shift);
    else if (this.controller.busy) this.controller.up(p.at, this.dragMods(p.mods));
    this.redraw();
  }

  /** Drags snap unless Shift is held, or the scene has no grid and these are tokens. */
  private dragMods(mods: Mods): Mods {
    return dragsFreely(this.session.mode, this.session.world) ? { ...mods, shift: true } : mods;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.redraw();
  }

  /** What a right click at `at` opens a menu on; selects the thing clicked if it wasn't. */
  menuTarget(at: Point): MenuTarget {
    const mode = this.session.mode;
    if (mode === 'tokens') return this.tokenMenuTarget(at);
    const hit = this.pick(at);
    if (hit && !this.session.selection.includes(hit)) this.session.setSelection([hit]);
    return { mode, at, docs: hit ? this.session.selectedDocs() : [] };
  }

  // What is where ---------------------------------------------------------------

  private get ctx(): DrawCtx & View {
    return { px: 1 / this.zoom, gridSize: this.session.world?.gridSize ?? 100 };
  }

  /** The documents of the current mode, bottom to top, as a drag in progress shows them (groups span their tiles). */
  private modeDocs(): { key: string; doc: Doc }[] {
    const coll = this.session.modeColl();
    const preview = this.controller.preview();
    const ctx = { mode: this.session.mode, gridSize: this.ctx.gridSize };
    const docs = this.session.docs.all(coll);
    if (this.session.mode === 'tiles')
      return previewTiles(docs, coll, preview, ctx).map((doc) => ({ key: keyOf({ coll, id: doc.id }), doc }));
    return docs.map((doc) => {
      const key = keyOf({ coll, id: doc.id });
      return { key, doc: previewDoc(key, doc, preview, ctx) };
    });
  }

  /** What the tiles mode picks, with groups and locks (see editor/tile-items.ts). */
  private tileItems(): TileItems {
    const s = this.session;
    const tiles = s.tiles();
    const selected = s.selection.map((k) => refOf(k).id);
    return new TileItems(withGroupBounds(tiles), s.modeColl('tiles'), TileItems.scopeOf(tiles, selected));
  }

  private items(): Hittable[] {
    if (this.session.mode === 'tokens') return this.tokenItems(false);
    if (this.session.mode === 'tiles') return this.tileItems().pick;
    return this.modeDocs().map(({ key, doc }) => ({ key, shape: shapeOf(doc, this.ctx) }));
  }

  private inRect(r: Rect, mode: MarqueeMode): string[] {
    const s = this.session;
    if (s.mode === 'tiles') return marqueeHits(this.tileItems().units(mode), r, mode);
    const hits = marqueeHits(this.items(), r, mode);
    return s.mode === 'tokens' ? hits.map((id) => s.tokenKey(id)) : hits;
  }

  /** The selection as drawn: groups with the bounds of what is in them. */
  private shownSelection(): { ref: { coll: string; id: string }; doc: Doc }[] {
    const docs = this.session.selectedDocs();
    if (this.session.mode !== 'tiles') return docs;
    const shown = new Map(withGroupBounds(this.session.tiles()).map((d) => [d.id, d]));
    return docs.map(({ ref, doc }) => ({ ref, doc: shown.get(doc.id) ?? doc }));
  }

  /** Tokens as discs where they are drawn: those you control, or all of them for a menu. */
  private tokenItems(all: boolean): Hittable[] {
    const out: Hittable[] = [];
    for (const t of this.session.tokens.values()) {
      const place = this.tokenPlace(t.id);
      if (place && (all || this.session.canControl(t)))
        out.push({ key: t.id, shape: { kind: 'circle', c: place.at, r: place.r } });
    }
    return out;
  }

  /** Where a click lays the ruler: a ruler started on a creature starts at its centre. */
  private rulerPoint(at: Point): Point {
    if (this.session.rulers.active) return at;
    const id = hitTest(this.tokenItems(true), at, 0);
    return (id ? this.tokenPlace(id)?.at : undefined) ?? at;
  }

  private pick(at: Point): string | undefined {
    if (this.session.mode === 'tokens') return undefined;
    return hitTest(this.items(), at, PICK_PX * this.ctx.px);
  }

  private pickHandle(at: Point): { key: string; handle: string } | undefined {
    const reach = HANDLE_PX * this.ctx.px;
    for (const { ref, doc } of this.shownSelection().reverse()) {
      const handle = handlesOf(doc, this.ctx).find((h) => Math.hypot(h.at[0] - at[0], h.at[1] - at[1]) <= reach);
      if (handle) return { key: keyOf(ref), handle: handle.id };
    }
    return undefined;
  }

  private tokenMenuTarget(at: Point): MenuTarget {
    const s = this.session;
    const id = hitTest(this.tokenItems(true), at, 0);
    const token = id ? s.tokens.get(id) : undefined;
    if (token && s.canControl(token)) {
      if (!s.isSelected(token.id)) s.select(token.id);
      return { mode: 'tokens', at, docs: s.selectedDocs(), token };
    }
    const selected = s.selected ? s.tokens.get(s.selected) : undefined;
    const mine = selected && s.canControl(selected) ? selected : undefined;
    return { mode: 'tokens', at, docs: [], token: mine, ...(token && { under: token }) };
  }

  private host(): EditorHost {
    const s = this.session;
    return {
      pick: (p) => this.pick(p),
      pickHandle: (p) => this.pickHandle(p),
      inRect: (r, mode) => this.inRect(r, mode),
      draggable: (key) => s.mode !== 'tiles' || this.tileItems().draggable(key),
      enter: (key, at) => (s.mode === 'tiles' ? this.tileItems().enter(key, at) : undefined),
      selection: () => s.selection,
      setSelection: (keys) => s.setSelection(keys),
      slop: () => SLOP_PX * this.ctx.px,
      commitMove: (keys, delta, free) => s.moveSelection(keys, delta, free),
      commitHandle: (key, handle, to, free) => s.reshape(key, handle, to, free),
    };
  }

  // Drawing ---------------------------------------------------------------------

  redraw(): void {
    const g = this.g.clear();
    const ctx = this.ctx;
    if (this.active) this.drawMode(g, ctx);
    this.tools.draw(g, this.hover, this.free, ctx);
    const preview = this.controller.preview();
    if (preview?.kind === 'marquee') drawMarquee(g, preview.rect, ctx);
  }

  private drawMode(g: Graphics, ctx: DrawCtx & View): void {
    const docs = this.modeDocs();
    for (const { doc } of docs) {
      if (doc.type === 'wall') drawWall(g, doc, ctx);
      else if (doc.type === 'light') drawLight(g, doc, ctx);
    }
    this.drawSelection(g, docs, ctx);
  }

  /** Outlines the selection and what is under the pointer; handles on the selection unless it is being moved. */
  private drawSelection(g: Graphics, docs: { key: string; doc: Doc }[], ctx: DrawCtx & View): void {
    const idle = !this.controller.busy && !this.tools.drawing && !this.measuring;
    const hovered = this.hover && idle ? this.pick(this.hover) : undefined;
    const selected = new Set(this.session.selection);
    const handles = this.controller.preview()?.kind !== 'move';
    for (const { key, doc } of docs) {
      if (!selected.has(key)) {
        if (key === hovered) drawOutline(g, doc, ctx, true);
        continue;
      }
      drawOutline(g, doc, ctx);
      if (handles) drawHandles(g, doc, ctx);
    }
  }
}

import type { Rect } from '@vtt/shared';
import { Container, Matrix, type Renderer, RenderTexture, Sprite } from 'pixi.js';
import { BAKE_CELL, bakeScale, cellsOver, overlaps } from './tile-bake.ts';

// Draws runs of still tiles into map pieces (cells) once, at about the
// screen's resolution, and shows those pictures instead of the tiles. A cell
// is baked again only when a tile over it changes or finishes loading, or the
// zoom calls for another resolution (the old picture shows until then).

/** A still tile: its drawn container (kept off the stage) and where it covers, padded. */
export interface Piece {
  root: Container;
  bounds: Rect;
  /** Settles once its picture has loaded (or failed to). */
  loaded?: Promise<unknown>;
}

interface Cell {
  texture: RenderTexture;
  /** Its place, `cx_cy`. */
  at: string;
  scale: number;
  stale: boolean;
  /** The frame it was last shown on. */
  used: number;
}

/** Cells baked again per frame when an older picture can stand in meanwhile. */
const REFRESH_PER_FRAME = 3;
/** Texture memory the cells may hold before those out of view are let go. */
const BUDGET_BYTES = 256 * 1024 * 1024;
/** Cells this far past the screen (a share of its size) are baked ahead. */
const AHEAD = 0.15;

const sizeOf = (cell: Cell) => cell.texture.width * cell.texture.height * 4;
const posKey = (cx: number, cy: number) => `${cx}_${cy}`;
const cellKey = (cx: number, cy: number, scale: number) => `${cx}_${cy}@${scale}`;
const cellRect = (cx: number, cy: number): Rect => ({
  x: cx * BAKE_CELL,
  y: cy * BAKE_CELL,
  w: BAKE_CELL,
  h: BAKE_CELL,
});

/** One run of still tiles between two live ones. */
class BakedRun {
  /** The tiles, drawn only into cells. */
  readonly source = new Container();
  /** The baked cells on the map. */
  readonly shown = new Container({ eventMode: 'none' });
  readonly cells = new Map<string, Cell>();
  private sprites = new Map<string, Sprite>();
  pieces: Piece[] = [];
  /** The cells some tile covers. */
  private filled = new Set<string>();

  setPieces(pieces: Piece[]): void {
    this.pieces = pieces;
    this.filled = new Set(pieces.flatMap((p) => cellsOver(p.bounds).map(([cx, cy]) => posKey(cx, cy))));
  }

  covers(cx: number, cy: number): boolean {
    return this.filled.has(posKey(cx, cy));
  }

  /** The picture in cell `[cx, cy]`: at `scale` if baked, else at any other scale. */
  best(cx: number, cy: number, scale: number): Cell | undefined {
    const exact = this.cells.get(cellKey(cx, cy, scale));
    if (exact) return exact;
    const at = posKey(cx, cy);
    for (const cell of this.cells.values()) if (cell.at === at) return cell;
    return undefined;
  }

  show(cx: number, cy: number, cell: Cell | undefined): void {
    const key = posKey(cx, cy);
    let sprite = this.sprites.get(key);
    if (!cell) {
      if (sprite) sprite.visible = false;
      return;
    }
    if (!sprite) {
      sprite = new Sprite();
      sprite.position.set(cx * BAKE_CELL, cy * BAKE_CELL);
      this.sprites.set(key, sprite);
      this.shown.addChild(sprite);
    }
    sprite.texture = cell.texture;
    sprite.setSize(BAKE_CELL, BAKE_CELL);
    sprite.visible = true;
  }

  /** Hides the sprites of cells not in `keep` (position keys). */
  hideAllBut(keep: Set<string>): void {
    for (const [key, sprite] of this.sprites) if (!keep.has(key)) sprite.visible = false;
  }

  /** Marks the cells over `r` to be baked again. */
  invalidate(r: Rect): void {
    for (const cell of this.cells.values()) {
      const [cx, cy] = cell.at.split('_').map(Number) as [number, number];
      if (overlaps(cellRect(cx, cy), r)) cell.stale = true;
    }
  }

  drop(key: string): void {
    const cell = this.cells.get(key);
    if (!cell) return;
    for (const sprite of this.sprites.values()) if (sprite.texture === cell.texture) sprite.visible = false;
    cell.texture.destroy(true);
    this.cells.delete(key);
  }

  destroy(): void {
    for (const key of [...this.cells.keys()]) this.drop(key);
    this.shown.destroy({ children: true });
    this.source.destroy({ children: false });
  }
}

export interface BakeRunIn {
  key: string;
  pieces: Piece[];
}

/** Bakes runs of still tiles into cells and shows them; `tick` it once a frame. */
export class TileBaker {
  private runs = new Map<string, BakedRun>();
  private renderer?: Renderer;
  private view?: Rect;
  private scale = 1;
  private frame = 0;

  /** The part of the map on screen, and the screen pixels per map pixel there. */
  setView(view: Rect, screenPerMap: number, renderer: Renderer): void {
    this.view = view;
    this.scale = bakeScale(screenPerMap);
    this.renderer = renderer;
  }

  /**
   * Takes the runs as they now stand and returns their containers to put on
   * the map (each at its run's `z`). Cells under a tile that came or went are
   * baked again, and again once a new tile's picture loads.
   */
  layout(runs: readonly BakeRunIn[]): Container[] {
    const next = new Map<string, BakedRun>();
    for (const r of runs) next.set(r.key, this.runs.get(r.key) ?? new BakedRun());
    for (const [key, run] of this.runs) if (!next.has(key)) run.destroy();
    for (const run of next.values()) run.source.removeChildren();
    for (const r of runs) {
      const run = next.get(r.key)!;
      this.changed(run, r.pieces);
      run.setPieces(r.pieces);
      for (const p of r.pieces) run.source.addChild(p.root);
    }
    this.runs = next;
    return [...next.values()].map((run) => run.shown);
  }

  /** Invalidates where pieces joined or left the run, and where a joining one loads. */
  private changed(run: BakedRun, pieces: Piece[]): void {
    const before = new Set(run.pieces.map((p) => p.root));
    const after = new Set(pieces.map((p) => p.root));
    for (const p of run.pieces) if (!after.has(p.root)) run.invalidate(p.bounds);
    for (const p of pieces) {
      if (before.has(p.root)) continue;
      run.invalidate(p.bounds);
      void p.loaded?.then(() => {
        if (!p.root.destroyed) run.invalidate(p.bounds);
      });
    }
  }

  tick(): void {
    if (!this.renderer || !this.view) return;
    this.frame++;
    const margin = { x: this.view.w * AHEAD, y: this.view.h * AHEAD };
    const wanted = cellsOver({
      x: this.view.x - margin.x,
      y: this.view.y - margin.y,
      w: this.view.w + 2 * margin.x,
      h: this.view.h + 2 * margin.y,
    });
    const budget = { refresh: REFRESH_PER_FRAME };
    for (const run of this.runs.values()) this.showRun(run, wanted, budget);
    this.evict();
  }

  private showRun(run: BakedRun, wanted: [number, number][], budget: { refresh: number }): void {
    const keep = new Set<string>();
    for (const [cx, cy] of wanted) {
      if (!run.covers(cx, cy)) continue;
      keep.add(posKey(cx, cy));
      let cell = run.best(cx, cy, this.scale);
      const fresh = cell?.scale === this.scale && !cell.stale;
      if (!fresh && (!cell || budget.refresh-- > 0)) cell = this.bake(run, cx, cy);
      if (cell) cell.used = this.frame;
      run.show(cx, cy, cell);
    }
    run.hideAllBut(keep);
  }

  /** Draws the run's tiles over cell `[cx, cy]` into its picture at the current scale. */
  private bake(run: BakedRun, cx: number, cy: number): Cell {
    const scale = this.scale;
    const key = cellKey(cx, cy, scale);
    let cell = run.cells.get(key);
    if (!cell) {
      const size = Math.ceil(BAKE_CELL * scale);
      const texture = RenderTexture.create({ width: size, height: size, resolution: 1 });
      cell = { texture, at: posKey(cx, cy), scale, stale: false, used: this.frame };
      run.cells.set(key, cell);
    }
    const area = cellRect(cx, cy);
    // A piece that was live on the map may come with the map's culling on it, which nothing here would lift.
    for (const p of run.pieces) {
      p.root.culled = false;
      p.root.visible = overlaps(p.bounds, area);
    }
    const transform = new Matrix(scale, 0, 0, scale, -area.x * scale, -area.y * scale);
    this.renderer!.render({ container: run.source, target: cell.texture, clear: true, transform });
    // Shown again, so a piece that goes live (a roof starting to fade) is seen on the map.
    for (const p of run.pieces) p.root.visible = true;
    cell.stale = false;
    return cell;
  }

  /** Lets go of cells out of view that are stale or at another scale, then the least recently shown while over budget. */
  private evict(): void {
    const idle = () =>
      [...this.runs.values()].flatMap((run) =>
        [...run.cells].filter(([, c]) => c.used !== this.frame).map(([key, cell]) => ({ run, key, cell })),
      );
    for (const { run, key, cell } of idle()) if (cell.stale || cell.scale !== this.scale) run.drop(key);
    let bytes = 0;
    for (const run of this.runs.values()) for (const cell of run.cells.values()) bytes += sizeOf(cell);
    if (bytes <= BUDGET_BYTES) return;
    for (const { run, key, cell } of idle().sort((a, b) => a.cell.used - b.cell.used)) {
      if (bytes <= BUDGET_BYTES) return;
      bytes -= sizeOf(cell);
      run.drop(key);
    }
  }

  destroy(): void {
    for (const run of this.runs.values()) run.destroy();
    this.runs.clear();
  }
}

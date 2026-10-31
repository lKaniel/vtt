import { chunkOf, feetToPx, pointInPolygon, type LightSource, type Point } from '@vtt/shared';
import { Graphics } from 'pixi.js';

/** Fog left over squares you've seen before but can't see now. */
const EXPLORED_FOG = 0.55;
const SAVE_DELAY_MS = 1500;

/** Where a viewer stands and how far it sees in the dark, in feet. */
interface Eye {
  at: Point;
  darkvision: number;
}

export interface ExploreContext {
  gridSize: number;
  chunkSize: number;
  /** Chunks whose walls are known; sight beyond them can't be trusted. */
  loaded: (chunk: string) => boolean;
  dark: boolean;
  lights: readonly LightSource[];
}

/**
 * The squares a player has seen, remembered in the browser per world and
 * player, and drawn as a shape that erases part of the fog.
 */
export class ExploredMap {
  readonly graphic = new Graphics();
  private squares = new Set<string>();
  private dirty = true;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private storageKey?: string;

  load(storageKey: string): void {
    this.storageKey = storageKey;
    this.squares.clear();
    try {
      for (const k of JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[]) this.squares.add(k);
    } catch {
      // A broken or blocked store just means starting with nothing explored.
    }
    this.dirty = true;
  }

  destroy(): void {
    clearTimeout(this.saveTimer);
  }

  /** Marks the squares inside `poly` (the viewer's sight) that the viewer can make out. */
  markSeen(viewer: Eye, poly: number[], ctx: ExploreContext): void {
    const g = ctx.gridSize;
    const box = bounds(poly);
    let added = false;
    for (let r = Math.floor(box.y0 / g); r <= Math.floor(box.y1 / g); r++) {
      for (let c = Math.floor(box.x0 / g); c <= Math.floor(box.x1 / g); c++) {
        const key = `${c},${r}`;
        const p: Point = [(c + 0.5) * g, (r + 0.5) * g];
        if (this.squares.has(key) || !canMakeOut(p, viewer, poly, ctx)) continue;
        this.squares.add(key);
        added = true;
      }
    }
    if (added) this.changed();
  }

  /** Redraws the explored shape if it changed. */
  draw(gridSize: number): void {
    if (!this.dirty) return;
    this.dirty = false;
    const e = this.graphic.clear();
    for (const [r, cols] of this.rows()) {
      for (const [start, end] of runs(cols))
        e.rect(start * gridSize, r * gridSize, (end - start + 1) * gridSize, gridSize);
    }
    e.fill({ color: 0xffffff, alpha: 1 - EXPLORED_FOG });
    e.blendMode = 'erase';
  }

  private changed(): void {
    this.dirty = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.save();
    }, SAVE_DELAY_MS);
  }

  private save(): void {
    if (!this.storageKey) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify([...this.squares]));
    } catch {
      // Storage full or blocked: exploration just won't survive a reload.
    }
  }

  private rows(): Map<number, number[]> {
    const rows = new Map<number, number[]>();
    for (const key of this.squares) {
      const [c, r] = key.split(',').map(Number) as [number, number];
      const row = rows.get(r) ?? [];
      row.push(c);
      rows.set(r, row);
    }
    return rows;
  }
}

function canMakeOut(p: Point, eye: Eye, poly: number[], ctx: ExploreContext): boolean {
  if (!ctx.loaded(chunkOf(p[0], p[1], ctx.chunkSize)) || !pointInPolygon(p, poly)) return false;
  if (!ctx.dark || Math.hypot(p[0] - eye.at[0], p[1] - eye.at[1]) <= feetToPx(eye.darkvision, ctx.gridSize))
    return true;
  return ctx.lights.some((l) => Math.hypot(p[0] - l.x, p[1] - l.y) <= feetToPx(l.bright + l.dim, ctx.gridSize));
}

function bounds(poly: number[]): { x0: number; y0: number; x1: number; y1: number } {
  const xs = poly.filter((_, i) => i % 2 === 0);
  const ys = poly.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Groups column numbers into runs of neighbours, so a big area is a few rectangles, not thousands. */
function runs(cols: number[]): [number, number][] {
  const sorted = [...cols].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const c of sorted) {
    const last = out.at(-1);
    if (last && c === last[1] + 1) last[1] = c;
    else out.push([c, c]);
  }
  return out;
}

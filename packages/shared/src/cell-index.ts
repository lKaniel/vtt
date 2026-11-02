import type { Point } from './schema.ts';

// A spatial index for many quick "what lies along this line" questions:
// things are filed under every cell their box touches, and a line visits
// only the cells it passes through.

export class CellIndex<T> {
  private cells = new Map<number, number[]>();
  private items: T[] = [];
  private seen: Uint32Array = new Uint32Array(0);
  private stamp = 0;

  constructor(private size: number) {}

  /** Files `item` under every cell its box (min, max corners) touches. */
  add(item: T, min: Point, max: Point): void {
    const n = this.items.push(item) - 1;
    // A pixel to spare, for lines that pass exactly through a cell's corner.
    const [x0, y0] = this.cellOf([min[0] - 1, min[1] - 1]);
    const [x1, y1] = this.cellOf([max[0] + 1, max[1] + 1]);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const k = key(x, y);
        const list = this.cells.get(k);
        if (list) list.push(n);
        else this.cells.set(k, [n]);
      }
    }
  }

  /** Whether `test` holds for some item filed along the line from a to b (each item tried once). */
  someAlong(a: Point, b: Point, test: (item: T) => boolean): boolean {
    if (this.seen.length < this.items.length) this.seen = new Uint32Array(this.items.length);
    const stamp = ++this.stamp;
    for (const k of this.cellsAlong(a, b)) {
      for (const n of this.cells.get(k) ?? []) {
        if (this.seen[n] === stamp) continue;
        this.seen[n] = stamp;
        if (test(this.items[n]!)) return true;
      }
    }
    return false;
  }

  private cellOf(p: Point): Point {
    return [Math.floor(p[0] / this.size), Math.floor(p[1] / this.size)];
  }

  /** The cells a line passes through, in order (Amanatides and Woo's walk). */
  private *cellsAlong(a: Point, b: Point): Generator<number> {
    let [x, y] = this.cellOf(a);
    const [tx, ty] = this.cellOf(b);
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const [sx, sy] = [Math.sign(dx), Math.sign(dy)];
    const next = (p: number, c: number, s: number, d: number) => {
      const edge = (s > 0 ? c + 1 : c) * this.size;
      return d === 0 ? Infinity : (edge - p) / d;
    };
    let [mx, my] = [next(a[0], x, sx, dx), next(a[1], y, sy, dy)];
    const [ix, iy] = [dx === 0 ? Infinity : this.size / Math.abs(dx), dy === 0 ? Infinity : this.size / Math.abs(dy)];
    yield key(x, y);
    // One step per cell boundary crossed: the walk ends in b's cell.
    for (let steps = Math.abs(tx - x) + Math.abs(ty - y); steps > 0; steps--) {
      if (mx < my) {
        x += sx;
        mx += ix;
      } else {
        y += sy;
        my += iy;
      }
      yield key(x, y);
    }
  }
}

const key = (x: number, y: number): number => (x + 32768) * 65536 + (y + 32768);

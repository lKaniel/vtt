// A picture to draw a scene sketch into: boxes, lines, discs and polygons
// in flat colours with alpha. Coordinates are the picture's pixels.

export type Rgba = [number, number, number, number];
export type Pt = [number, number];

/** How a line is drawn: its colour, thickness, and dash length (0: solid). */
export interface Pen {
  colour: Rgba;
  width?: number;
  dash?: number;
}

/** "#rrggbb" (or "#rgb") as a colour, with alpha 0 to 1; grey when it can't be read. */
export function rgba(hex: string | undefined, alpha = 1): Rgba {
  const h = (hex ?? '').replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const n = /^[0-9a-f]{6}$/i.test(full) ? parseInt(full, 16) : 0x808080;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round(alpha * 255)];
}

export class Raster {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    fill: Rgba,
  ) {
    this.data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) this.data.set(fill, i * 4);
  }

  /** Blends one pixel. */
  dot(x: number, y: number, [r, g, b, a]: Rgba): void {
    const [px, py] = [Math.round(x), Math.round(y)];
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const i = (py * this.width + px) * 4;
    const t = a / 255;
    const d = this.data;
    d[i] = d[i]! * (1 - t) + r * t;
    d[i + 1] = d[i + 1]! * (1 - t) + g * t;
    d[i + 2] = d[i + 2]! * (1 - t) + b * t;
    d[i + 3] = 255;
  }

  rect({ x, y, w, h }: { x: number; y: number; w: number; h: number }, colour: Rgba): void {
    const [x0, y0] = [Math.max(0, Math.round(x)), Math.max(0, Math.round(y))];
    const [x1, y1] = [Math.min(this.width, Math.round(x + w)), Math.min(this.height, Math.round(y + h))];
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.dot(px, py, colour);
  }

  /** A line `width` pixels thick; `dash` draws only every other stretch that long. */
  line(a: Pt, b: Pt, { colour, width = 1, dash = 0 }: Pen): void {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(len));
    const r = width / 2;
    for (let s = 0; s <= steps; s++) {
      if (dash && Math.floor(s / dash) % 2) continue;
      const t = s / steps;
      this.disc([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], r, colour, true);
    }
  }

  /** A filled circle; `opaque` overwrites instead of blending, so a thick line doesn't darken where it overlaps. */
  disc([cx, cy]: Pt, r: number, colour: Rgba, opaque = false): void {
    const rr = Math.max(r, 0.5);
    for (let py = Math.floor(cy - rr); py <= Math.ceil(cy + rr); py++) {
      for (let px = Math.floor(cx - rr); px <= Math.ceil(cx + rr); px++) {
        if ((px - cx) ** 2 + (py - cy) ** 2 > rr * rr) continue;
        if (opaque) this.set(px, py, colour);
        else this.dot(px, py, colour);
      }
    }
  }

  ring([cx, cy]: Pt, r: number, colour: Rgba, width = 1): void {
    const steps = Math.max(8, Math.ceil(2 * Math.PI * r));
    for (let s = 0; s < steps; s++) {
      const t = (s / steps) * 2 * Math.PI;
      this.disc([cx + Math.cos(t) * r, cy + Math.sin(t) * r], width / 2, colour, true);
    }
  }

  /** Fills a polygon (even-odd), row by row. */
  polygon(points: readonly Pt[], colour: Rgba): void {
    const ys = points.map((p) => p[1]);
    for (
      let py = Math.max(0, Math.floor(Math.min(...ys)));
      py <= Math.min(this.height - 1, Math.ceil(Math.max(...ys)));
      py++
    ) {
      const xs = crossings(points, py + 0.5);
      for (let i = 0; i + 1 < xs.length; i += 2) this.rect({ x: xs[i]!, y: py, w: xs[i + 1]! - xs[i]!, h: 1 }, colour);
    }
  }

  private set(x: number, y: number, colour: Rgba): void {
    if (colour[3] < 255) return this.dot(x, y, colour);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data.set(colour, (y * this.width + x) * 4);
  }
}

/** Where a row at `y` crosses a polygon's edges, left to right. */
function crossings(points: readonly Pt[], y: number): number[] {
  const xs: number[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    if (a[1] <= y === b[1] <= y) return;
    xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
  });
  return xs.sort((p, q) => p - q);
}

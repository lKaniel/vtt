import type { Point } from '@vtt/shared';
import type { Graphics, StrokeInput } from 'pixi.js';

// Draws on Pixi graphics and keeps what it drew as plain shapes on the map:
// the walk, attack and spell previews (PathPreview.ts) draw with one, and
// the 3D view (view3d/marks3d.ts) draws the same shapes over the surfaces
// they lie on, where the flat map's picture can't be seen.

export interface Paint {
  color: number;
  alpha: number;
}
export interface Line extends Paint {
  width: number;
}

/** A shape on the map, with its stroke and fill. */
export type Shape = (
  { kind: 'line'; points: Point[] } | { kind: 'circle'; at: Point; r: number } | { kind: 'poly'; points: Point[] }
) & { stroke?: Line; fill?: Paint };

type Path =
  { kind: 'line'; points: Point[] } | { kind: 'circle'; at: Point; r: number } | { kind: 'poly'; points: Point[] };

interface Style {
  color?: number;
  alpha?: number;
  width?: number;
}

export class Sketch {
  /** What was drawn since the last clear. */
  shapes: Shape[] = [];
  /** Goes up with every change. */
  version = 0;
  /** The path being drawn, and the shape it became once stroked or filled. */
  private path?: Path;
  private shape?: Shape;

  constructor(readonly graphics: Graphics) {}

  moveTo(x: number, y: number): this {
    this.begin({ kind: 'line', points: [[x, y]] });
    this.graphics.moveTo(x, y);
    return this;
  }

  lineTo(x: number, y: number): this {
    if (this.path?.kind === 'line' && !this.shape) this.path.points.push([x, y]);
    else this.begin({ kind: 'line', points: [[x, y]] });
    this.graphics.lineTo(x, y);
    return this;
  }

  circle(x: number, y: number, r: number): this {
    this.begin({ kind: 'circle', at: [x, y], r });
    this.graphics.circle(x, y, r);
    return this;
  }

  poly(flat: number[]): this {
    const points: Point[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) points.push([flat[i]!, flat[i + 1]!]);
    this.begin({ kind: 'poly', points });
    this.graphics.poly(flat);
    return this;
  }

  stroke(style: Style & StrokeInput): this {
    this.paint().stroke = { width: style.width ?? 1, color: style.color ?? 0xffffff, alpha: style.alpha ?? 1 };
    this.graphics.stroke(style);
    return this;
  }

  fill(style: Style): this {
    this.paint().fill = { color: style.color ?? 0xffffff, alpha: style.alpha ?? 1 };
    this.graphics.fill(style);
    return this;
  }

  clear(): this {
    this.shapes = [];
    this.path = this.shape = undefined;
    this.version++;
    this.graphics.clear();
    return this;
  }

  private begin(path: Path): void {
    this.path = path;
    this.shape = undefined;
  }

  /** The shape the current path became, made on its first stroke or fill. */
  private paint(): Shape {
    if (!this.shape) {
      this.shape = { ...this.path! };
      this.shapes.push(this.shape);
      this.version++;
    }
    return this.shape;
  }
}

import type { Rect } from './chunks.ts';
import type { Point } from './schema.ts';

// The cells a gridded scene is cut into (scene.json `grid`): 5 ft squares,
// or 5 ft hexes in rows (pointy top, Foundry's "hexagonal rows") or in
// columns (flat top). gridSize is the distance between two neighbouring
// cells' centres, so a creature one cell across is gridSize wide on either.
// Hexes use axial coordinates [q, r]: a row is a fixed r, and each row
// sits half a hex over from the one before.

export const GRID_KINDS = ['none', 'square', 'hex-rows', 'hex-cols'] as const;
export type GridKind = (typeof GRID_KINDS)[number];
export type CellGrid = Exclude<GridKind, 'none'>;

/** A scene's grid: none unless it asks for squares or hexes. */
export function gridKind(scene: { grid?: string }): GridKind {
  return (GRID_KINDS as readonly string[]).includes(scene.grid ?? '') ? (scene.grid as GridKind) : 'none';
}

export interface Lattice {
  kind: CellGrid;
  size: number;
  /** The cell a point is in. */
  cellOf(p: Point): Point;
  centre(cell: Point): Point;
  /** The steps to a cell's neighbours. */
  steps: readonly Point[];
  /** Steps from one cell to another, each 5 ft. */
  distance(a: Point, b: Point): number;
  /** The cells a straight line from `a` to `b` steps into, one at a time, `b` included. */
  between(a: Point, b: Point): Point[];
  /** The cell's outline, for drawing. */
  corners(cell: Point): Point[];
}

const SQUARE_STEPS: readonly Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const HEX_STEPS: readonly Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

const SQRT3 = Math.sqrt(3);

function squares(size: number): Lattice {
  return {
    kind: 'square',
    size,
    cellOf: (p) => [Math.floor(p[0] / size), Math.floor(p[1] / size)],
    centre: (c) => [(c[0] + 0.5) * size, (c[1] + 0.5) * size],
    steps: SQUARE_STEPS,
    distance: (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])),
    between: (a, b) => {
      const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      const at = (k: number): Point => [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k)];
      return Array.from({ length: n }, (_, i) => at((i + 1) / n));
    },
    corners: ([x, y]) => [
      [x * size, y * size],
      [(x + 1) * size, y * size],
      [(x + 1) * size, (y + 1) * size],
      [x * size, (y + 1) * size],
    ],
  };
}

/** The nearest hex to fractional axial coordinates. */
function hexRound(q: number, r: number): Point {
  const s = -q - r;
  const rs = Math.round(s);
  let [rq, rr] = [Math.round(q), Math.round(r)];
  const [dq, dr, ds] = [Math.abs(rq - q), Math.abs(rr - r), Math.abs(rs - s)];
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq + 0, rr + 0];
}

const hexDistance = (a: Point, b: Point) => {
  const [dq, dr] = [a[0] - b[0], a[1] - b[1]];
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

/** Hexes in rows: pointy top, axial [q, r] with r the row; hex [0, 0] fits in the map's top left corner. */
function hexRows(size: number): Lattice {
  const half = size / 2;
  const radius = size / SQRT3;
  const rowStep = (size * SQRT3) / 2;
  const centre = ([q, r]: Point): Point => [size * (q + r / 2) + half, rowStep * r + radius];
  return {
    kind: 'hex-rows',
    size,
    cellOf: ([x, y]) => {
      const r = (y - radius) / rowStep;
      return hexRound((x - half) / size - r / 2, r);
    },
    centre,
    steps: HEX_STEPS,
    distance: hexDistance,
    between: (a, b) => {
      const n = hexDistance(a, b);
      // Nudged off the edges so a line along two hexes' border picks one side.
      const at = (k: number) => hexRound(a[0] + (b[0] - a[0]) * k + 1e-6, a[1] + (b[1] - a[1]) * k + 2e-6);
      return Array.from({ length: n }, (_, i) => at((i + 1) / n));
    },
    corners: (cell) => {
      const [cx, cy] = centre(cell);
      return Array.from({ length: 6 }, (_, i): Point => {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
      });
    },
  };
}

const swap = (p: Point): Point => [p[1], p[0]];

/** Hexes in columns (flat top): hexes in rows mirrored across the diagonal, x for y and q for r. */
function hexCols(size: number): Lattice {
  const rows = hexRows(size);
  return {
    kind: 'hex-cols',
    size,
    cellOf: (p) => swap(rows.cellOf(swap(p))),
    centre: (c) => swap(rows.centre(swap(c))),
    steps: HEX_STEPS,
    distance: hexDistance,
    between: (a, b) => rows.between(swap(a), swap(b)).map(swap),
    corners: (c) => rows.corners(swap(c)).map(swap),
  };
}

/** A scene's cells; undefined without a grid. */
export function sceneLattice(scene: { gridSize: number; grid?: string }): Lattice | undefined {
  const kind = gridKind(scene);
  return kind === 'none' ? undefined : latticeOf(kind, scene.gridSize);
}

/** The cells of a gridded scene. */
export function latticeOf(kind: CellGrid, size: number): Lattice {
  if (kind === 'square') return squares(size);
  return kind === 'hex-rows' ? hexRows(size) : hexCols(size);
}

/** The centre of the cell a point is in. */
export const snapToCell = (p: Point, lattice: Lattice): Point => lattice.centre(lattice.cellOf(p));

/** The cells over a part of the map (and a ring around it), for drawing the grid. */
export function cellsIn(lattice: Lattice, r: Rect): Point[] {
  const corners: Point[] = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ].map((p) => lattice.cellOf(p as Point));
  const span = (i: 0 | 1) => [Math.min(...corners.map((c) => c[i])) - 1, Math.max(...corners.map((c) => c[i])) + 1];
  const [[a0, a1], [b0, b1]] = [span(0), span(1)];
  const pad = lattice.size;
  const near = ([x, y]: Point) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  const out: Point[] = [];
  for (let a = a0!; a <= a1!; a++) for (let b = b0!; b <= b1!; b++) if (near(lattice.centre([a, b]))) out.push([a, b]);
  return out;
}

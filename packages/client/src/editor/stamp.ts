import type { Point } from '@vtt/shared';

// The stamp brush of the tiles mode, as map makers use it in Foundry
// (Baileywiki's props, 3D Canvas's asset brush): pick a picture or a 3D model,
// then every click puts one down and a drag scatters them, each turned and
// sized as the brush says (or at random). This is the arithmetic; the brush
// on the map is canvas/StampBrush.ts and its state session/session-stamp.ts.

/** A picture or model on the brush, with its size once known: a picture's pixels, a model's units across, up and deep. */
export interface StampAsset {
  src: string;
  kind: 'image' | 'video' | 'model';
  size?: readonly number[];
}

/** How the brush puts things down. */
export interface StampLook {
  /** Degrees clockwise. */
  turn: number;
  /** Times its own size. */
  scale: number;
  /** Each stamp turned at random (from `turn`). */
  randomTurn: boolean;
  /** Each stamp up to this much bigger or smaller at random (0.2: 80% to 120%). */
  randomSize: number;
  /** A drag lays one stamp every `spacing` times its width. */
  spacing: number;
}

export const DEFAULT_LOOK: StampLook = { turn: 0, scale: 1, randomTurn: false, randomSize: 0, spacing: 1 };

/** Squares map art is drawn for (Foundry's and Baileywiki's default): a picture is as big on a 140 px grid. */
const ART_GRID = 100;
/** Feet one model unit stands for: Baileywiki's and 3D Canvas's models are made at 1 unit = 5 ft. */
const UNIT_FEET = 5;
const FEET_PER_SQUARE = 5;
/** The picture under a 3D model: the flat map shows nothing of it. */
export const BLANK = '/art/ui/blank.svg';

/** How big a stamp comes out on a grid of `grid` px: a model also gets its height in feet. */
export function footprint(
  asset: StampAsset,
  look: Pick<StampLook, 'scale'>,
  grid: number,
): { w: number; h: number; height?: number } {
  const s = asset.size;
  if (!s || s.length < 2) return { w: grid * 2 * look.scale, h: grid * 2 * look.scale };
  if (asset.kind !== 'model')
    return { w: (s[0]! * grid * look.scale) / ART_GRID, h: (s[1]! * grid * look.scale) / ART_GRID };
  const px = (UNIT_FEET * grid * look.scale) / FEET_PER_SQUARE;
  return { w: s[0]! * px, h: (s[2] ?? s[0]!) * px, height: s[1]! * UNIT_FEET * look.scale };
}

/** What a stamp at `at` adds: an image tile, or a model tile on a blank picture. */
export interface StampDoc {
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  rotation?: number;
  model?: { src: string; height?: number; rotation?: number };
}

/** Where stamps pick their chances: Math.random at the table, fixed in tests. */
export interface StampDice {
  grid: number;
  random: () => number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The tile one stamp centred on `at` makes. */
export function stampDoc(asset: StampAsset, look: StampLook, at: Point, dice: StampDice): StampDoc {
  const sized = look.randomSize ? look.scale * (1 - look.randomSize + 2 * look.randomSize * dice.random()) : look.scale;
  const turn = round2(look.randomTurn ? (look.turn + dice.random() * 360) % 360 : look.turn);
  const size = footprint(asset, { scale: sized }, dice.grid);
  const [w, h] = [Math.max(1, Math.round(size.w)), Math.max(1, Math.round(size.h))];
  const rect = { x: Math.round(at[0] - w / 2), y: Math.round(at[1] - h / 2), w, h };
  if (asset.kind !== 'model') return { ...rect, src: asset.src, ...(turn ? { rotation: turn } : {}) };
  const height = size.height === undefined ? {} : { height: round2(size.height) };
  // The tile turns too, so its picture on the flat map (the model's plan) turns with the model.
  const turned = turn ? { rotation: turn } : {};
  return { ...rect, src: BLANK, ...turned, model: { src: asset.src, ...height, ...turned } };
}

/** Where a click stamps: on half squares (a square's middle or its corner), or where it is with `free`. */
export function stampPoint(at: Point, grid: number, free: boolean): Point {
  if (free || grid <= 0) return at;
  const half = grid / 2;
  return [Math.round(at[0] / half) * half, Math.round(at[1] / half) * half];
}

/** The spots a drag along `stroke` stamps: its start, then one every `spacing` pixels along it. */
export function scatterPoints(stroke: readonly Point[], spacing: number): Point[] {
  if (!stroke.length) return [];
  const out: Point[] = [stroke[0]!];
  let left = spacing;
  for (let i = 1; i < stroke.length; i++) {
    const [a, b] = [stroke[i - 1]!, stroke[i]!];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let along = left;
    for (; along <= len + 1e-9; along += spacing) {
      const t = along / len;
      out.push([round2(a[0] + (b[0] - a[0]) * t), round2(a[1] + (b[1] - a[1]) * t)]);
    }
    left = along - len;
  }
  return out;
}

import type { Point } from '@vtt/shared';

// The walls round a set of rooms: where two rooms touch, the wall between
// them is there once, and the doors, windows and archways of either room are
// cut into it. Rooms are boxes, so every wall runs along x or y.

export type Side = 'n' | 's' | 'e' | 'w';

/** A room's wall: one edge of its box, from corner to corner. */
export interface RoomLine {
  lo: Point;
  hi: Point;
  /** The room it belongs to, which names its walls. */
  owner: string;
  level?: string;
}

/** A door, window or archway: a stretch of a wall line, `lo` to `hi` along it. */
export interface Opening {
  horizontal: boolean;
  /** The y of a horizontal line, the x of a vertical one. */
  line: number;
  lo: number;
  hi: number;
  /** "arch" leaves a gap; any other kind is a wall of that kind (door, window, secret...). */
  kind: string;
  level?: string;
}

export interface WallSegment {
  a: Point;
  b: Point;
  /** "wall", or the opening's kind. */
  kind: string;
  owner: string;
  level?: string;
}

interface Line {
  horizontal: boolean;
  at: number;
  owner: string;
  level?: string;
  spans: [number, number][];
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;
const keyOf = (horizontal: boolean, at: number, level?: string) =>
  `${level ?? ''}|${horizontal ? 'h' : 'v'}|${round(at)}`;

/** Spans that overlap or touch, joined. */
function merged(spans: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [lo, hi] of [...spans].sort((p, q) => p[0] - q[0])) {
    const last = out.at(-1);
    if (last && lo <= last[1]) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

/** `spans` with the `holes` cut out of them. */
function cut(spans: [number, number][], holes: Opening[]): [number, number][] {
  let out = spans;
  for (const hole of holes) {
    out = out.flatMap(([lo, hi]): [number, number][] => {
      if (hole.hi <= lo || hole.lo >= hi) return [[lo, hi]];
      const parts: [number, number][] = [
        [lo, Math.min(hole.lo, hi)],
        [Math.max(hole.hi, lo), hi],
      ];
      return parts.filter(([a, b]) => b - a > 1e-6);
    });
  }
  return out;
}

function linesOf(edges: readonly RoomLine[]): Map<string, Line> {
  const lines = new Map<string, Line>();
  for (const { lo, hi, owner, level } of edges) {
    const horizontal = lo[1] === hi[1];
    const at = horizontal ? lo[1] : lo[0];
    const span: [number, number] = horizontal
      ? [Math.min(lo[0], hi[0]), Math.max(lo[0], hi[0])]
      : [Math.min(lo[1], hi[1]), Math.max(lo[1], hi[1])];
    const key = keyOf(horizontal, at, level);
    const line = lines.get(key) ?? { horizontal, at, owner, level, spans: [] };
    line.spans.push(span);
    lines.set(key, line);
  }
  return lines;
}

const pointOn = (line: { horizontal: boolean; at: number }, v: number): Point =>
  line.horizontal ? [round(v), round(line.at)] : [round(line.at), round(v)];

/** The walls, doors and windows round `edges`, with `openings` cut in. */
export function roomWalls(edges: readonly RoomLine[], openings: readonly Opening[]): WallSegment[] {
  const out: WallSegment[] = [];
  for (const [key, line] of linesOf(edges)) {
    const holes = openings.filter((o) => keyOf(o.horizontal, o.line, o.level) === key);
    const seg = (lo: number, hi: number, kind: string): WallSegment => ({
      a: pointOn(line, lo),
      b: pointOn(line, hi),
      kind,
      owner: line.owner,
      ...(line.level && { level: line.level }),
    });
    for (const [lo, hi] of cut(merged(line.spans), holes)) out.push(seg(lo, hi, 'wall'));
    for (const hole of holes) if (hole.kind !== 'arch') out.push(seg(hole.lo, hole.hi, hole.kind));
  }
  return out;
}

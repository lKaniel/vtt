import { aimTemplate, type ItemMode, type Point, rectBetween, type Template } from '@vtt/shared';

// The tools that make drawings, notes, templates, regions and sounds, as a
// small state machine with no canvas in it: boxes are dragged, polygons and
// lines clicked point by point (a click on the first point closes a polygon;
// finish() ends a line or region), freehand follows the drag, pins go down
// with a click and templates are dragged out from their origin.

export type ItemTool =
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'polygon'
  | 'line'
  | 'freehand'
  | 'note'
  | 'sound'
  | 'circle'
  | 'cone'
  | 'ray'
  | 'square'
  | 'region';

/** What a finished tool makes: the fields of a new document of `mode` (no id, type or look yet). */
export interface Draft {
  mode: ItemMode;
  data: Record<string, unknown>;
}

interface Snap {
  gridSize: number;
  free: boolean;
}

type Kind = 'box' | 'points' | 'freehand' | 'pin' | 'template';

const TOOLS: Record<ItemTool, { kind: Kind; mode: ItemMode }> = {
  rect: { kind: 'box', mode: 'drawings' },
  ellipse: { kind: 'box', mode: 'drawings' },
  text: { kind: 'box', mode: 'drawings' },
  polygon: { kind: 'points', mode: 'drawings' },
  line: { kind: 'points', mode: 'drawings' },
  freehand: { kind: 'freehand', mode: 'drawings' },
  note: { kind: 'pin', mode: 'notes' },
  sound: { kind: 'pin', mode: 'sounds' },
  circle: { kind: 'template', mode: 'templates' },
  cone: { kind: 'template', mode: 'templates' },
  ray: { kind: 'template', mode: 'templates' },
  square: { kind: 'template', mode: 'templates' },
  region: { kind: 'points', mode: 'regions' },
};

/** The tools of each mode, in toolbar order. */
export const ITEM_TOOLS: Record<ItemMode, ItemTool[]> = {
  drawings: ['rect', 'ellipse', 'polygon', 'line', 'freehand', 'text'],
  notes: ['note'],
  templates: ['circle', 'cone', 'ray', 'square'],
  regions: ['region'],
  sounds: ['sound'],
};

export const isItemTool = (tool: string): tool is ItemTool => tool in TOOLS;

/** Freehand keeps points at least this far apart (map pixels). */
const FREEHAND_GAP = 8;
/** A click this close (in squares) to a polygon's first point closes it. */
const CLOSE_SQUARES = 0.25;
/** A new sound's reach, in feet. */
const SOUND_FT = 30;

const roundTo = (v: number, step: number) => Math.round(v / step) * step;
const snapTo = (p: Point, step: number): Point => [roundTo(p[0], step), roundTo(p[1], step)];
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const TEMPLATE_SHAPES = { circle: 'circle', cone: 'cone', ray: 'line', square: 'square' } as const;

export class ShapeDraft {
  private points: Point[] = [];

  constructor(readonly tool: ItemTool) {}

  private get kind(): Kind {
    return TOOLS[this.tool].kind;
  }

  private get mode(): ItemMode {
    return TOOLS[this.tool].mode;
  }

  /** Something is half drawn. */
  get busy(): boolean {
    return this.points.length > 0;
  }

  cancel(): void {
    this.points = [];
  }

  /** Where a press lands: pins and template origins on half squares, the rest on corners. */
  private spot(at: Point, s: Snap): Point {
    if (s.free) return [Math.round(at[0]), Math.round(at[1])];
    const half = this.kind === 'pin' || this.kind === 'template';
    return snapTo(at, half ? s.gridSize / 2 : s.gridSize);
  }

  /** A press; returns what it finishes (a pin, a closed polygon). */
  press(at: Point, s: Snap): Draft | undefined {
    const p = this.spot(at, s);
    if (this.kind === 'pin') return this.pin(p);
    if (this.kind !== 'points') {
      this.points = [p];
      return undefined;
    }
    const first = this.points[0];
    const closes = this.tool !== 'line' && first && this.points.length >= 3;
    if (closes && Math.hypot(at[0] - first[0], at[1] - first[1]) <= CLOSE_SQUARES * s.gridSize) return this.finish();
    if (!this.points.length || !same(this.points.at(-1)!, p)) this.points.push(p);
    return undefined;
  }

  /** The pointer moved with the button down: freehand takes the point. */
  drag(at: Point): void {
    const last = this.points.at(-1);
    if (this.kind !== 'freehand' || !last) return;
    if (Math.hypot(at[0] - last[0], at[1] - last[1]) >= FREEHAND_GAP)
      this.points.push([Math.round(at[0]), Math.round(at[1])]);
  }

  /** The button came up: boxes, freehand and templates are done. */
  release(at: Point, s: Snap): Draft | undefined {
    if (this.kind === 'points' || this.kind === 'pin' || !this.busy) return undefined;
    const out = this.preview(at, s);
    this.points = [];
    return out && { mode: this.mode, data: out };
  }

  /** Ends a line, polygon or region drawn so far (Enter, a right click); too few points keeps drawing. */
  finish(): Draft | undefined {
    const points = this.points;
    const least = this.tool === 'line' ? 2 : 3;
    if (this.kind !== 'points' || points.length < least) return undefined;
    this.points = [];
    return { mode: this.mode, data: this.mode === 'regions' ? { points } : { shape: this.tool, points } };
  }

  /** What would be made with the pointer at `at`, for drawing while it is made. */
  preview(at: Point, s: Snap): Record<string, unknown> | undefined {
    const start = this.points[0];
    if (!start) return undefined;
    switch (this.kind) {
      case 'box': {
        const r = rectBetween(start, this.spot(at, s));
        if (r.w <= 0 || r.h <= 0) return undefined;
        return { shape: this.tool, ...r, ...(this.tool === 'text' ? { text: 'Text' } : {}) };
      }
      case 'freehand': {
        const end: Point = [Math.round(at[0]), Math.round(at[1])];
        const points = same(this.points.at(-1)!, end) ? this.points : [...this.points, end];
        return points.length >= 2 ? { shape: 'freehand', points } : undefined;
      }
      case 'template':
        return this.template(start, at, s);
      default:
        return this.pointsPreview(at, s);
    }
  }

  private pointsPreview(at: Point, s: Snap): Record<string, unknown> {
    const points = [...this.points, this.spot(at, s)];
    return this.mode === 'regions' ? { points } : { shape: this.tool, points };
  }

  private template(origin: Point, to: Point, s: Snap): Record<string, unknown> {
    const shape = TEMPLATE_SHAPES[this.tool as keyof typeof TEMPLATE_SHAPES];
    const base = { shape, x: origin[0], y: origin[1], distance: 5 } as Template;
    return { ...base, ...aimTemplate(base, to, s) };
  }

  private pin(at: Point): Draft {
    const [x, y] = at;
    return { mode: this.mode, data: this.mode === 'sounds' ? { x, y, radius: SOUND_FT } : { x, y } };
  }
}

import type { Drawing, Note, Point, Region, RegionBehavior, Sound, Template } from '@vtt/shared';
import { z } from 'zod';

// The drawings, map notes, measured templates, ambient sounds and (v12)
// regions of a Foundry scene, as ours. Foundry measures templates and sounds
// in grid units; we in feet. What has no match here goes in the report.

const num = z.number().optional().catch(undefined);
const str = z.string().optional().catch(undefined).nullable();

const flat = z.array(z.number()).optional().catch(undefined);

const FoundryDrawing = z.object({
  x: z.number(),
  y: z.number(),
  shape: z.object({ type: z.string(), width: num, height: num, points: flat }),
  strokeColor: str,
  strokeWidth: num,
  fillType: num,
  fillColor: str,
  fillAlpha: num,
  text: str,
  fontSize: num,
  textColor: str,
});

const FoundryNote = z.object({ x: z.number(), y: z.number(), entryId: str, pageId: str, text: str });

const FoundryTemplate = z.object({
  t: z.enum(['circle', 'cone', 'ray', 'rect']),
  x: z.number(),
  y: z.number(),
  distance: z.number().positive(),
  direction: num,
  angle: num,
  width: num,
  fillColor: str,
});

const FoundrySound = z.object({
  x: z.number(),
  y: z.number(),
  radius: z.number().positive(),
  path: str,
  volume: num,
  walls: z.boolean().optional().catch(undefined),
  darkness: z.object({ min: num, max: num }).optional().catch(undefined),
});

const FoundryShape = z.object({
  type: z.string(),
  x: num,
  y: num,
  width: num,
  height: num,
  radiusX: num,
  radiusY: num,
  points: flat,
});

const FoundryRegion = z.object({
  name: str,
  color: str,
  visibility: num,
  shapes: z.array(FoundryShape).catch([]),
  behaviors: z.array(z.object({ type: z.string(), system: z.record(z.string(), z.unknown()).catch({}) })).catch([]),
});

const items = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .optional()
    .catch(undefined)
    .transform((xs) => (xs ?? []).flatMap((x) => (item.safeParse(x).success ? [item.parse(x)] : [])));

const FoundryPlaceables = z.object({
  drawings: items(FoundryDrawing),
  notes: items(FoundryNote),
  templates: items(FoundryTemplate),
  sounds: items(FoundrySound),
  regions: items(FoundryRegion),
});

type Data<K extends keyof z.infer<typeof FoundryPlaceables>> = z.infer<typeof FoundryPlaceables>[K][number];

export interface PlaceableLookups {
  grid: { size: number; distance: number };
  /** The `pack://` reference of a copied file, by its Foundry path. */
  media: (path: string) => string | undefined;
  /** Our journal entry id for a Foundry entry id, when the entry came along. */
  entries?: (foundryId: string) => string | undefined;
  /** Our page id for a Foundry journal page id. */
  pages?: (foundryId: string) => string | undefined;
}

export interface ConvertedPlaceables {
  drawings: Drawing[];
  notes: Note[];
  templates: Template[];
  sounds: Sound[];
  regions: Region[];
  skipped: string[];
}

const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;
const opt = <K extends string, V>(key: K, value: V | null | undefined) =>
  (value === undefined || value === null || (value as unknown) === '' ? {} : { [key]: value }) as Partial<Record<K, V>>;

/** Pairs of numbers as points, moved by `at`. */
function pointsOf(xs: readonly number[] | undefined, at: Point = [0, 0]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < (xs?.length ?? 0); i += 2) out.push([xs![i]! + at[0], xs![i + 1]! + at[1]]);
  return out;
}

const BOXES: Record<string, 'rect' | 'ellipse'> = { r: 'rect', e: 'ellipse' };

function drawingLook(d: Data<'drawings'>) {
  const filled = (d.fillType ?? (d.fillColor ? 1 : 0)) > 0;
  return {
    ...opt('stroke', d.strokeColor),
    ...opt('strokeWidth', d.strokeWidth),
    ...(filled ? { ...opt('fill', d.fillColor), ...opt('fillAlpha', d.fillAlpha) } : {}),
  };
}

/** A drawing without its id, for each of its shapes. */
type NewDrawing = Drawing extends infer D ? (D extends unknown ? Omit<D, 'id'> : never) : never;

function drawingOf(d: Data<'drawings'>): NewDrawing | undefined {
  const look = drawingLook(d);
  const box = { x: d.x, y: d.y, w: d.shape.width ?? 0, h: d.shape.height ?? 0 };
  if (d.text)
    return { shape: 'text', ...box, text: d.text, ...opt('fontSize', d.fontSize), ...opt('textColor', d.textColor) };
  const boxed = BOXES[d.shape.type];
  if (boxed) return { shape: boxed, ...box, ...look };
  const points = pointsOf(d.shape.points, [d.x, d.y]);
  if (points.length < 2) return undefined;
  return { shape: d.shape.type === 'f' ? 'freehand' : 'polygon', points, ...look };
}

function noteOf(n: Data<'notes'>, look: PlaceableLookups): Omit<Note, 'id'> {
  const entry = n.entryId ? look.entries?.(n.entryId) : undefined;
  const page = entry && n.pageId ? look.pages?.(n.pageId) : undefined;
  return { x: n.x, y: n.y, ...opt('label', n.text), ...opt('entry', entry), ...opt('page', page) };
}

/** A Foundry rectangle runs from its corner along its diagonal: the square it covers, from its centre. */
function templateOf(t: Data<'templates'>, feet: (units: number) => number, px: number): Omit<Template, 'id'> {
  const look = opt('color', t.fillColor);
  if (t.t === 'rect') {
    const dir = ((t.direction ?? 45) * Math.PI) / 180;
    const half = (t.distance * px) / 2;
    const at = { x: Math.round(t.x + Math.cos(dir) * half), y: Math.round(t.y + Math.sin(dir) * half) };
    return { shape: 'square', ...at, distance: Math.round(feet(t.distance) / Math.SQRT2), ...look };
  }
  const base = { x: t.x, y: t.y, distance: feet(t.distance), ...opt('direction', t.direction) };
  if (t.t === 'circle') return { shape: 'circle', x: t.x, y: t.y, distance: base.distance, ...look };
  if (t.t === 'cone') return { shape: 'cone', ...base, ...opt('angle', t.angle), ...look };
  return { shape: 'line', ...base, ...opt('width', t.width && feet(t.width)), ...look };
}

function soundOf(s: Data<'sounds'>, src: string, feet: (units: number) => number): Omit<Sound, 'id'> {
  const band: [number, number] = [s.darkness?.min ?? 0, s.darkness?.max ?? 1];
  const limited = band[0] > 0 || band[1] < 1;
  return {
    x: s.x,
    y: s.y,
    radius: feet(s.radius),
    src,
    ...opt('volume', s.volume),
    ...opt('walls', s.walls),
    ...(limited ? { activeAt: band } : {}),
  };
}

/** A shape's outline: polygons as they are, rectangles by their corners, ellipses as 16 points. */
function outline(s: z.infer<typeof FoundryShape>): Point[] {
  const [x, y, w, h] = [s.x ?? 0, s.y ?? 0, s.width ?? 0, s.height ?? 0];
  if (s.type === 'polygon') return pointsOf(s.points);
  if (s.type === 'rectangle')
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ];
  if (s.type !== 'ellipse') return [];
  return Array.from({ length: 16 }, (_, i): Point => {
    const a = (i / 16) * 2 * Math.PI;
    return [Math.round(x + Math.cos(a) * (s.radiusX ?? 0)), Math.round(y + Math.sin(a) * (s.radiusY ?? 0))];
  });
}

function behaviorOf(b: Data<'regions'>['behaviors'][number]): RegionBehavior | undefined {
  const text = b.system.text;
  if (b.type === 'displayScrollingText' && typeof text === 'string' && text) return { type: 'message', text };
  return undefined;
}

function regionOf(r: Data<'regions'>, unknown: string[]): Omit<Region, 'id'> | undefined {
  const points = outline(r.shapes[0] ?? { type: '' });
  if (points.length < 3) return undefined;
  const behaviors = r.behaviors.flatMap((b) => {
    const ours = behaviorOf(b);
    if (!ours) unknown.push(b.type);
    return ours ?? [];
  });
  const visible = (r.visibility ?? 0) > 0;
  return { ...opt('name', r.name), ...opt('color', r.color), ...(visible ? { visible } : {}), points, behaviors };
}

const numbered = <T>(prefix: string, list: readonly (T | undefined)[]) =>
  list.flatMap((item) => (item ? [item] : [])).map((item, i) => ({ id: `${prefix}-${i + 1}`, ...item }));

function soundsOf(s: z.infer<typeof FoundryPlaceables>, look: PlaceableLookups, feet: (u: number) => number) {
  const missing: string[] = [];
  const sounds = s.sounds.map((snd) => {
    const src = snd.path ? look.media(snd.path) : undefined;
    if (!src) missing.push(snd.path ?? '(none)');
    return src ? soundOf(snd, src, feet) : undefined;
  });
  const skipped = missing.length
    ? [`${plural(missing.length, 'sound')} whose file is not in the module (${missing.join(', ')})`]
    : [];
  return { sounds: numbered('sound', sounds) as Sound[], skipped };
}

/** Converts the placeables of one Foundry scene. */
export function foundryPlaceables(data: unknown, look: PlaceableLookups): ConvertedPlaceables {
  const s = FoundryPlaceables.parse(data);
  const feet = (units: number) => Math.round((units * 5) / look.grid.distance);
  const px = look.grid.size / look.grid.distance;
  const unknown: string[] = [];
  const { sounds, skipped } = soundsOf(s, look, feet);
  const regions = numbered(
    'region',
    s.regions.map((r) => regionOf(r, unknown)),
  ) as Region[];
  if (unknown.length)
    skipped.push(`${plural(unknown.length, 'region behaviour')} we have no match for (${unknown.join(', ')})`);
  return {
    drawings: numbered('drawing', s.drawings.map(drawingOf)),
    notes: numbered(
      'note',
      s.notes.map((n) => noteOf(n, look)),
    ),
    templates: numbered(
      'template',
      s.templates.map((t) => templateOf(t, feet, px)),
    ),
    sounds,
    regions,
    skipped,
  };
}

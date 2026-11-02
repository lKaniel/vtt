import type { Template } from '@vtt/shared';

// Foundry v14 keeps measured templates as regions marked with
// flags.core.MeasuredTemplate, their area in the region's shape (pixels).
// Here they become our templates (in feet) again, and leave the regions.

type Loose = Record<string, unknown>;
const obj = (x: unknown): Loose => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Loose) : {});
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** Whether a Foundry region is a v14 measured template. */
export const isTemplateRegion = (region: unknown): boolean =>
  obj(obj(obj(region).flags).core).MeasuredTemplate !== undefined;

type NewTemplate = Omit<Template, 'id'>;

interface Scale {
  /** Pixels to feet. */
  feet: (px: number) => number;
}

const SHAPES: Record<string, (s: Loose, at: { x: number; y: number }, scale: Scale) => NewTemplate | undefined> = {
  circle: (s, at, { feet }) => ({ shape: 'circle', ...at, distance: feet(num(s.radius) ?? 0) }),
  ellipse: (s, at, { feet }) => ({ shape: 'circle', ...at, distance: feet(num(s.radiusX) ?? 0) }),
  cone: (s, at, { feet }) => ({
    shape: 'cone',
    ...at,
    distance: feet(num(s.radius) ?? 0),
    direction: num(s.rotation) ?? 0,
    ...(num(s.angle) ? { angle: num(s.angle) } : {}),
  }),
  line: (s, at, { feet }) => ({
    shape: 'line',
    ...at,
    distance: feet(num(s.length) ?? 0),
    direction: num(s.rotation) ?? 0,
    ...(num(s.width) ? { width: feet(num(s.width)!) } : {}),
  }),
  rectangle: (s, at, { feet }) => {
    const [w, h] = [num(s.width) ?? 0, num(s.height) ?? 0];
    return { shape: 'square', x: at.x + w / 2, y: at.y + h / 2, distance: feet(Math.max(w, h)) };
  },
};

/** A template region as our template, from its first shape; undefined if that shape has no match. */
export function templateFromRegion(region: unknown, scale: Scale): NewTemplate | undefined {
  const r = obj(region);
  const shape = obj(Array.isArray(r.shapes) ? r.shapes[0] : undefined);
  const make = SHAPES[String(shape.type)];
  const at = { x: num(shape.x) ?? 0, y: num(shape.y) ?? 0 };
  const template = make?.(shape, at, scale);
  if (!template || template.distance <= 0) return undefined;
  return { ...template, ...(typeof r.color === 'string' && r.color ? { color: r.color } : {}) };
}

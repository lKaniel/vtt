import type { Doc } from '@vtt/core';
import { HOUR, TileTextureSchema, TOKEN_FILTERS, WALL_PRESETS, type WallRules, wallPreset } from '@vtt/shared';
import { describe, type Field, type FieldValue, flag, LEVEL, media, MIXED, options, plain } from './field-kit.ts';
import { MODEL_FIELDS } from './model-fields.ts';
import { ITEM_FIELDS } from './item-fields.ts';
import { doorFields, presetPatch, wallRuleFields } from './wall-fields.ts';

export { type Field, type FieldValue, MIXED } from './field-kit.ts';

// The inspector's fields for each kind of placeable (Figma's right panel):
// what to show for a selection, the value they share (or "mixed"), and the
// patch an input makes.

/** The tile a wall or light is fastened to: it moves, copies and deletes with it. */
const ON_TILE = plain('tile', 'On tile', 'select', { choices: 'tiles' });

const WALL_FIELDS: Field[] = [
  {
    ...plain('kind', 'Kind', 'select', { options: options(...Object.keys(WALL_PRESETS), 'custom') }),
    get: (d) => wallPreset(d as WallRules),
    patch: (value) => presetPatch(String(value)),
  },
  plain('door', 'Door', 'select', { options: options('closed', 'open', 'locked'), when: (d) => !!d.door }),
  plain('name', 'Name', 'text', { when: (d) => !!d.door }),
  describe({ when: (d) => !!d.door }),
  ...doorFields(),
  ...wallRuleFields(),
  ON_TILE,
  LEVEL,
];

const LIGHT_FIELDS: Field[] = [
  plain('bright', 'Bright (ft)', 'number'),
  plain('dim', 'Dim (ft)', 'number'),
  plain('color', 'Colour', 'color'),
  plain('colorIntensity', 'Colour strength (0-1)', 'number'),
  plain('luminosity', 'Luminosity (0-1)', 'number'),
  plain('attenuation', 'Edge softness (0-1)', 'number'),
  plain('angle', 'Beam (°)', 'number'),
  plain('rotation', 'Facing (° from south)', 'number', { when: (d) => typeof d.angle === 'number' && d.angle < 360 }),
  plain('animation', 'Animation', 'select', { options: options('', 'flicker', 'pulse') }),
  { ...plain('darkness', 'Magical darkness', 'check'), get: (d) => d.darkness === true },
  {
    ...plain('walls', 'Shines through walls', 'check'),
    get: (d) => d.walls === false,
    patch: (v) => ({ walls: v === true ? false : null }),
  },
  {
    // In hours; a change lights it afresh (the server counts the new end time from now).
    ...plain('lasts', 'Burns for (h, empty: forever)', 'number'),
    get: (d) => (typeof d.lasts === 'number' ? d.lasts / HOUR : undefined),
    patch: (v) => ({ lasts: Number(v) > 0 ? Math.round(Number(v) * HOUR) : null, endsAt: null }),
  },
  ON_TILE,
  LEVEL,
];

const isRect = (d: Doc) => d.kind === 'rect';

const drawn = (d: Doc) => d.kind !== 'group';

const isImage = (d: Doc) => d.kind === 'image';

/** A picture tile with no 3D model: its flat-only looks (tint, mirroring, scrolling, shadow) count. */
const isFlat = (d: Doc) => isImage(d) && !d.model;

/** How fast a picture slides one way; both still removes the scroll. */
function scrollField(axis: 'x' | 'y', label: string): Field {
  const of = (d: Doc) => (d.scroll ?? { x: 0, y: 0 }) as { x: number; y: number };
  return {
    ...plain(`scroll.${axis}`, label, 'number', { when: isFlat }),
    get: (d) => of(d)[axis],
    patch: (value, doc) => {
      const next = { ...(doc ? of(doc) : { x: 0, y: 0 }), [axis]: Number(value) || 0 };
      return { scroll: next.x || next.y ? next : null };
    },
  };
}

const SHADOW = { offset: 12, blur: 8, alpha: 0.5 };
const shadowOf = (d: Doc) => d.shadow as typeof SHADOW | undefined;
const hasShadow = (d: Doc) => isFlat(d) && !!shadowOf(d);

/** One number of a picture's drop shadow. */
function shadowField(part: keyof typeof SHADOW, label: string): Field {
  return {
    ...plain(`shadow.${part}`, label, 'number', { when: hasShadow }),
    get: (d) => shadowOf(d)?.[part],
    patch: (value, doc) => ({ shadow: { ...SHADOW, ...(doc && shadowOf(doc)), [part]: Number(value) || 0 } }),
  };
}

const SHADOW_FIELDS: Field[] = [
  {
    ...plain('shadow', 'Drop shadow', 'check', { when: isFlat }),
    get: (d) => !!shadowOf(d),
    patch: (value) => ({ shadow: value === true ? SHADOW : null }),
  },
  shadowField('offset', 'Shadow offset (px)'),
  shadowField('blur', 'Shadow blur (px)'),
  shadowField('alpha', 'Shadow darkness (0-1)'),
];

const TILE_FIELDS: Field[] = [
  plain('name', 'Name', 'text'),
  describe({ when: drawn }),
  plain('x', 'X', 'number', { when: drawn }),
  plain('y', 'Y', 'number', { when: drawn }),
  plain('w', 'Width', 'number', { when: drawn }),
  plain('h', 'Height', 'number', { when: drawn }),
  flag('background', 'Ground', { when: drawn }),
  flag('locked', 'Locked'),
  LEVEL,
  plain('color', 'Colour', 'color', { when: isRect }),
  plain('texture', 'Texture', 'select', { options: options('', ...TileTextureSchema.options), when: isRect }),
  media('src', 'Picture', 'image', { when: isImage }),
  flag('overhead', 'Roof (over creatures)', { when: isImage }),
  plain('occludedAlpha', 'Opacity under it (0-1)', 'number', { when: (d) => isImage(d) && d.overhead === true }),
  scrollField('x', 'Scrolls across (px/s)'),
  scrollField('y', 'Scrolls down (px/s)'),
  plain('tint', 'Tint', 'color', { when: isFlat }),
  plain('rotation', 'Rotation (degrees)', 'number', { when: isImage }),
  flag('flipX', 'Mirrored left to right', { when: isFlat }),
  flag('flipY', 'Mirrored top to bottom', { when: isFlat }),
  plain('alpha', 'Opacity (0-1)', 'number', { when: isImage }),
  ...SHADOW_FIELDS,
  ...MODEL_FIELDS,
];

const TOKEN_FIELDS: Field[] = [
  { ...plain('hidden', 'Hidden from players', 'check'), get: (d) => d.hidden === true },
  plain('filter', 'Colour filter', 'select', { options: options('', ...TOKEN_FILTERS) }),
];

const FIELDS: Record<string, Field[]> = {
  wall: WALL_FIELDS,
  light: LIGHT_FIELDS,
  tile: TILE_FIELDS,
  token: TOKEN_FIELDS,
  ...ITEM_FIELDS,
};

/** The fields to show for a selection; none when it mixes types. */
export function fieldsFor(docs: readonly Doc[]): Field[] {
  const type = docs[0]?.type;
  if (!type || docs.some((d) => d.type !== type)) return [];
  return (FIELDS[type] ?? []).filter((f) => !f.when || docs.every(f.when));
}

/** The value every document has for a field, or MIXED. */
export function commonValue(docs: readonly Doc[], field: Field): FieldValue | undefined | typeof MIXED {
  const values = new Set(docs.map(field.get));
  return values.size > 1 ? MIXED : [...values][0];
}

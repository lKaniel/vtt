import type { Doc } from '@vtt/core';
import { TileTextureSchema, WALL_PRESETS, type WallRules, wallPreset } from '@vtt/shared';
import { type Field, type FieldValue, flag, MIXED, options, plain } from './field-kit.ts';
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
  ...doorFields(),
  ...wallRuleFields(),
  ON_TILE,
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
  ON_TILE,
];

const isRect = (d: Doc) => d.kind === 'rect';

const drawn = (d: Doc) => d.kind !== 'group';

const TILE_FIELDS: Field[] = [
  plain('name', 'Name', 'text'),
  plain('x', 'X', 'number', { when: drawn }),
  plain('y', 'Y', 'number', { when: drawn }),
  plain('w', 'Width', 'number', { when: drawn }),
  plain('h', 'Height', 'number', { when: drawn }),
  flag('background', 'Ground', { when: drawn }),
  flag('locked', 'Locked'),
  plain('color', 'Colour', 'color', { when: isRect }),
  plain('texture', 'Texture', 'select', { options: options('', ...TileTextureSchema.options), when: isRect }),
  plain('src', 'Picture', 'text', { when: (d) => d.kind === 'image' }),
];

const TOKEN_FIELDS: Field[] = [{ ...plain('hidden', 'Hidden from players', 'check'), get: (d) => d.hidden === true }];

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

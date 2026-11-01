import type { Doc, Patch } from '@vtt/core';
import { TileTextureSchema } from '@vtt/shared';

// The inspector's fields for each kind of placeable (Figma's right panel):
// what to show for a selection, the value they share (or "mixed"), and the
// patch an input makes.

export const MIXED = Symbol('mixed');

export type FieldKind = 'number' | 'text' | 'color' | 'select' | 'check';
export type FieldValue = string | number | boolean;

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  options?: { value: string; label: string }[];
  /** The value shown for one document. */
  get: (doc: Doc) => FieldValue | undefined;
  /** The patch an input makes. */
  patch: (value: FieldValue) => Patch;
  /** Shown only when this holds for every selected document. */
  when?: (doc: Doc) => boolean;
}

function plain(key: string, label: string, kind: FieldKind, extra: Partial<Field> = {}): Field {
  return {
    key,
    label,
    kind,
    get: (doc) => doc[key] as FieldValue | undefined,
    patch: (value) => ({ [key]: toValue(kind, value) }),
    ...extra,
  };
}

/** Empty text and unticked boxes remove the field; numbers stay numbers. */
function toValue(kind: FieldKind, value: FieldValue): unknown {
  if (value === '' || value === false) return null;
  return kind === 'number' ? Number(value) : value;
}

const options = (...values: string[]) => values.map((value) => ({ value, label: value || 'none' }));

const WALL_KIND: Record<string, Patch> = {
  wall: { door: null, sight: null },
  door: { door: 'closed', sight: null },
  window: { door: null, sight: false },
};

function wallKind(doc: Doc): string {
  if (doc.door) return 'door';
  return doc.sight === false ? 'window' : 'wall';
}

const WALL_FIELDS: Field[] = [
  {
    ...plain('kind', 'Kind', 'select', { options: options('wall', 'door', 'window') }),
    get: wallKind,
    patch: (value) => WALL_KIND[String(value)] ?? {},
  },
  plain('door', 'Door', 'select', { options: options('closed', 'open', 'locked'), when: (d) => !!d.door }),
];

const LIGHT_FIELDS: Field[] = [
  plain('bright', 'Bright (ft)', 'number'),
  plain('dim', 'Dim (ft)', 'number'),
  plain('color', 'Colour', 'color'),
  plain('animation', 'Animation', 'select', { options: options('', 'flicker', 'pulse') }),
  { ...plain('darkness', 'Magical darkness', 'check'), get: (d) => d.darkness === true },
];

const isRect = (d: Doc) => d.kind === 'rect';

const drawn = (d: Doc) => d.kind !== 'group';
const flag = (key: string, label: string, extra: Partial<Field> = {}): Field => ({
  ...plain(key, label, 'check', extra),
  get: (d) => d[key] === true,
});

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

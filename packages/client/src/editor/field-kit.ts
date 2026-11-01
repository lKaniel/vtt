import type { Doc, Patch } from '@vtt/core';

// The pieces inspector fields are made of (see inspector.ts).

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
  /** The patch an input makes, on each selected document. */
  patch: (value: FieldValue, doc?: Doc) => Patch;
  /** Shown only when this holds for every selected document. */
  when?: (doc: Doc) => boolean;
  /** A select whose options the session fills in: the game's journal entries, or the scene's levels. */
  choices?: 'journals' | 'levels';
}

export function plain(key: string, label: string, kind: FieldKind, extra: Partial<Field> = {}): Field {
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

export const options = (...values: string[]) => values.map((value) => ({ value, label: value || 'none' }));

export const flag = (key: string, label: string, extra: Partial<Field> = {}): Field => ({
  ...plain(key, label, 'check', extra),
  get: (d) => d[key] === true,
});

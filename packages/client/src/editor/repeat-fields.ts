import type { Doc, Patch } from '@vtt/core';
import type { TileRepeat } from '@vtt/shared';
import { type Field, media, plain } from './field-kit.ts';

// The inspector's fields for a picture that repeats across its tile, as
// Baileywiki's Unlimited Terrain: endless ground from a tileable picture
// (shared TileRepeatSchema), and the menu's shuffle, which picks a new
// shift, size and turn in Unlimited Terrain's own ranges.

const repeatOf = (d: Doc | undefined) => d?.repeat as TileRepeat | undefined;
const isFlatImage = (d: Doc) => d.kind === 'image' && !d.model;
const repeats = (d: Doc) => isFlatImage(d) && !!repeatOf(d);

/** Sets one part of the repeat; empty goes back to its default. */
function withPart(doc: Doc | undefined, key: keyof TileRepeat, value: string | number | undefined): Patch {
  const { [key]: _old, ...rest } = repeatOf(doc) ?? {};
  return { repeat: value === '' || value === undefined ? rest : { ...rest, [key]: value } };
}

function repeatNumber(key: 'scale' | 'x' | 'y' | 'rotation', label: string): Field {
  return {
    ...plain(`repeat.${key}`, label, 'number', { when: repeats }),
    get: (d) => repeatOf(d)?.[key],
    patch: (value, doc) => withPart(doc, key, value === '' ? '' : Number(value)),
  };
}

export const REPEAT_FIELDS: Field[] = [
  {
    ...plain('repeat', 'Repeats across the tile', 'check', { when: isFlatImage }),
    get: (d) => !!repeatOf(d),
    patch: (value) => ({ repeat: value === true ? {} : null }),
  },
  {
    ...media('repeat.src', 'Repeated picture (empty: its own)', 'image', { when: repeats }),
    get: (d) => repeatOf(d)?.src,
    patch: (value, doc) => withPart(doc, 'src', String(value)),
  },
  repeatNumber('scale', 'Pattern size (× its own)'),
  repeatNumber('x', 'Pattern shift across (copies)'),
  repeatNumber('y', 'Pattern shift down (copies)'),
  repeatNumber('rotation', 'Pattern turn (degrees)'),
];

/** Unlimited Terrain's shuffle ranges: shift −1 to 1 copies, size 0.4 to 2, turns in 5° steps. */
const within = (min: number, max: number, step: number, r: number) => Math.round((min + (max - min) * r) / step) * step;

/** A repeat shuffled: a new shift, size and turn, the same picture. */
export function shuffledRepeat(repeat: TileRepeat, random: () => number = Math.random): TileRepeat {
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    ...repeat,
    x: round(within(-1, 1, 0.1, random())),
    y: round(within(-1, 1, 0.1, random())),
    scale: round(within(0.4, 2, 0.1, random())),
    rotation: within(0, 355, 5, random()),
  };
}

import type { Doc, Patch } from '@vtt/core';
import type { Model3D } from '@vtt/shared';
import { type Field, flag, media, options, plain } from './field-kit.ts';

// The inspector's 3D fields of a picture tile (see shared/model3d.ts): the
// model that stands on it in the 3D view, how tall, how high and which way
// it stands, and whether it repeats across the tile.

const isImage = (d: Doc) => d.kind === 'image';
const modelOf = (d: Doc | undefined) => d?.model as Model3D | undefined;
const hasModel = (d: Doc) => isImage(d) && !!modelOf(d);

/** The model's file: a new one keeps the rest of the model, none takes the model away. */
const MODEL_SRC: Field = {
  ...media('model.src', '3D model', 'model', { when: isImage }),
  get: (d) => modelOf(d)?.src,
  patch: (value, doc) => (value === '' ? { model: null } : { model: { ...modelOf(doc), src: String(value) } }),
};

/** Sets one part of the model; empty goes back to its default. */
function withPart(doc: Doc | undefined, key: keyof Model3D, value: unknown): Patch {
  const { [key]: _old, ...rest } = modelOf(doc) ?? { src: '' };
  return { model: value === '' || value === undefined ? rest : { ...rest, [key]: value } };
}

function modelNumber(
  key: 'height' | 'elevation' | 'rotation' | 'piece',
  label: string,
  extra: Partial<Field> = {},
): Field {
  return {
    ...plain(`model.${key}`, label, 'number', { when: hasModel, ...extra }),
    get: (d) => modelOf(d)?.[key],
    patch: (value, doc) => withPart(doc, key, value === '' ? '' : Number(value)),
  };
}

export const MODEL_FIELDS: Field[] = [
  MODEL_SRC,
  modelNumber('height', 'Model height (ft, empty: to scale)'),
  modelNumber('elevation', 'Model stands at (ft)'),
  modelNumber('rotation', 'Model turned (°)'),
  {
    ...plain('model.fill', 'Model fills', 'select', { options: options('', 'fit', 'tile'), when: hasModel }),
    options: [
      { value: '', label: 'the tile, stretched' },
      { value: 'fit', label: 'the tile, in proportion' },
      { value: 'tile', label: 'repeats across the tile' },
    ],
    get: (d) => modelOf(d)?.fill ?? '',
    patch: (value, doc) => withPart(doc, 'fill', value),
  },
  modelNumber('piece', 'One model every (squares)', { when: (d) => hasModel(d) && modelOf(d)?.fill === 'tile' }),
  flag('only2d', 'Only in the flat map (hidden in 3D)', { when: isImage }),
];

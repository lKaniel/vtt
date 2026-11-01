import type { Doc, Patch } from '@vtt/core';
import { type Field, type FieldValue, flag, options, plain } from './field-kit.ts';

// Inspector fields of drawings, notes, templates, regions and sounds. A
// region shows its first behaviour (more can be written in its file).

const isText = (d: Doc) => d.shape === 'text';
const notText = (d: Doc) => d.shape !== 'text';
const shapeIs =
  (...shapes: string[]) =>
  (d: Doc) =>
    shapes.includes(d.shape as string);

/** Every placed thing: its level, whether players see it, whether it is locked. */
const PLACED: Field[] = [
  plain('level', 'Level', 'select', { choices: 'levels' }),
  flag('hidden', 'Hidden from players'),
  flag('locked', 'Locked'),
];

const DRAWING_FIELDS: Field[] = [
  plain('stroke', 'Line colour', 'color', { when: notText }),
  plain('strokeWidth', 'Line width', 'number', { when: notText }),
  plain('fill', 'Fill', 'color', { when: notText }),
  plain('fillAlpha', 'Fill opacity', 'number', { when: notText }),
  plain('text', 'Text', 'text', { when: isText }),
  plain('fontSize', 'Font size', 'number', { when: isText }),
  plain('textColor', 'Text colour', 'color', { when: isText }),
  ...PLACED,
];

const NOTE_FIELDS: Field[] = [
  plain('label', 'Label', 'text'),
  plain('entry', 'Journal entry', 'select', { choices: 'journals' }),
  plain('icon', 'Icon', 'text'),
  plain('color', 'Colour', 'color'),
  ...PLACED,
];

const TEMPLATE_FIELDS: Field[] = [
  plain('distance', 'Size (ft)', 'number'),
  plain('direction', 'Direction (°)', 'number', { when: shapeIs('cone', 'line', 'square') }),
  plain('angle', 'Angle (°)', 'number', { when: shapeIs('cone') }),
  plain('width', 'Width (ft)', 'number', { when: shapeIs('line') }),
  plain('color', 'Colour', 'color'),
  ...PLACED,
];

/** "0.5-1" for a darkness band; empty for always. */
const band: Field = {
  key: 'activeAt',
  label: 'Only at darkness',
  kind: 'text',
  get: (d) => (Array.isArray(d.activeAt) ? (d.activeAt as number[]).join('-') : ''),
  patch: (v) => {
    const m = /^\s*([\d.]+)\s*-\s*([\d.]+)\s*$/.exec(String(v));
    return { activeAt: m ? [Number(m[1]), Number(m[2])] : null };
  },
};

const SOUND_FIELDS: Field[] = [
  plain('name', 'Name', 'text'),
  plain('src', 'File', 'text'),
  plain('radius', 'Reach (ft)', 'number'),
  plain('volume', 'Volume (0-1)', 'number'),
  flag('walls', 'Muffled by walls'),
  band,
  ...PLACED,
];

type Behavior = Record<string, unknown> & { type: string };
const first = (d: Doc): Behavior | undefined => (d.behaviors as Behavior[] | undefined)?.[0];
const withFirst = (d: Doc | undefined, b: Behavior | undefined): Patch => {
  const rest = ((d?.behaviors as Behavior[] | undefined) ?? []).slice(1);
  return { behaviors: b ? [b, ...rest] : rest };
};

/** A field of the first behaviour, shown when it is of `type`. */
function behaviorField(type: string, key: string, label: string, kind: Field['kind']): Field {
  return {
    key: `behavior.${key}`,
    label,
    kind,
    when: (d) => first(d)?.type === type,
    get: (d) => (kind === 'check' ? first(d)?.[key] === true : (first(d)?.[key] as FieldValue | undefined)),
    patch: (v, doc) => {
      const { [key]: _old, ...rest } = (doc && first(doc)) ?? { type };
      const value = kind === 'number' ? Number(v) : v;
      const kept = value === '' || value === false ? rest : { ...rest, [key]: value };
      return withFirst(doc, kept as Behavior);
    },
  };
}

const BEHAVIORS = ['', 'difficult', 'trap', 'message', 'reveal', 'teleport', 'level'];

const REGION_FIELDS: Field[] = [
  plain('name', 'Name', 'text'),
  plain('color', 'Colour', 'color'),
  flag('visible', 'Players see it'),
  flag('disabled', 'Turned off'),
  {
    key: 'behavior',
    label: 'When entered',
    kind: 'select',
    options: options(...BEHAVIORS),
    get: (d) => first(d)?.type ?? '',
    patch: (v, doc) => withFirst(doc, v ? { type: String(v) } : undefined),
  },
  behaviorField('message', 'text', 'Message', 'text'),
  behaviorField('message', 'gmOnly', 'To the GM only', 'check'),
  behaviorField('trap', 'message', 'Trap says', 'text'),
  flag('behavior.once', 'Springs once', {
    when: (d) => first(d)?.type === 'trap',
    get: (d) => first(d)?.once === true,
  }),
  behaviorField('difficult', 'multiplier', 'Cost ×', 'number'),
  behaviorField('level', 'to', 'To level', 'text'),
  band,
  ...PLACED,
];

export const ITEM_FIELDS: Record<string, Field[]> = {
  drawing: DRAWING_FIELDS,
  note: NOTE_FIELDS,
  template: TEMPLATE_FIELDS,
  region: REGION_FIELDS,
  sound: SOUND_FIELDS,
};

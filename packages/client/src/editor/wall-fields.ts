import type { Doc, Patch } from '@vtt/core';
import { DOOR_SOUNDS, WALL_PRESETS, type WallPreset } from '@vtt/shared';
import { type Field, flag, options, plain } from './field-kit.ts';

// The inspector's wall rules: what a wall stops (movement, sight, light,
// sound) and, for proximity walls, from how close a sense gets through.

const RULES = ['door', 'secret', 'doorSound', 'move', 'sight', 'light', 'sound', 'threshold'] as const;
const SENSES = [
  ['sight', 'Sight'],
  ['light', 'Light'],
  ['sound', 'Sound'],
] as const;

/** The patch that makes a wall one of the usual kinds, clearing whatever it stopped before. */
export function presetPatch(kind: string): Patch {
  if (!(kind in WALL_PRESETS)) return {};
  const preset = WALL_PRESETS[kind as WallPreset];
  const reset: Patch = Object.fromEntries(RULES.map((k) => [k, null]));
  return { ...reset, ...preset };
}

/** A restriction select: `normal` is the default, so it is stored as nothing. */
function rule(key: string, label: string, values: string[]): Field {
  return {
    ...plain(key, label, 'select', { options: options(...values) }),
    get: (d) => (d[key] as string | undefined) ?? 'normal',
    patch: (value) => ({ [key]: value === 'normal' ? null : value }),
  };
}

/** Feet within which a proximity wall lets `sense` through. */
function threshold(sense: string, label: string): Field {
  const of = (d: Doc) => (d.threshold ?? {}) as Record<string, number>;
  return {
    ...plain(`threshold.${sense}`, `${label} passes within (ft)`, 'number'),
    get: (d) => of(d)[sense] ?? 0,
    patch: (value, doc) => ({ threshold: { ...(doc ? of(doc) : {}), [sense]: Number(value) } }),
    when: (d) => d[sense] === 'proximity',
  };
}

const isDoor = (d: Doc) => !!d.door;

/** A door's secrecy and sound (wooden unless set). */
export function doorFields(): Field[] {
  return [
    flag('secret', 'Secret (players see a wall)', { when: isDoor }),
    {
      ...plain('doorSound', 'Sound', 'select', { options: options(...DOOR_SOUNDS, 'none'), when: isDoor }),
      get: (d) => (d.doorSound as string | undefined) ?? 'wood',
      patch: (value) => ({ doorSound: value === 'wood' ? null : value }),
    },
  ];
}

export function wallRuleFields(): Field[] {
  return [
    rule('move', 'Movement', ['none', 'normal']),
    ...SENSES.map(([key, label]) => rule(key, label, ['none', 'normal', 'limited', 'proximity'])),
    ...SENSES.map(([key, label]) => threshold(key, label)),
    {
      ...plain('dir', 'One way', 'select', {
        options: [
          { value: '', label: 'both ways' },
          { value: 'left', label: 'stops from the left' },
          { value: 'right', label: 'stops from the right' },
        ],
      }),
      get: (d) => (d.dir as string | undefined) ?? '',
    },
  ];
}

import { RegionBehaviorSchema, TRIGGER_ACTIONS, TriggerActionSchema, TriggerTargetSchema } from '@vtt/shared';
import type { FieldValue } from './field-kit.ts';

// The trigger editor's model (ui/TriggerDialog.tsx): a tile's chain of
// actions, or a region's behaviours, as rows of plain fields. Nested values
// (a target, a point, a list of pictures) are read and written by path.

/** One action or behaviour as the editor holds it. */
export type Step = Record<string, unknown> & { type: string };

/** What a select's options come from: the game's documents, or fixed values. */
export type StepChoices = 'tiles' | 'doors' | 'journals' | 'scenes' | 'levels' | 'target';

export interface StepField {
  /** A path into the step: `to.1` is a point's y, `target.id` the target's id. */
  key: string;
  label: string;
  kind: 'text' | 'number' | 'check' | 'select' | 'list';
  options?: string[];
  /** A select filled from the game; the first option is `none` (or "this one"). */
  choices?: StepChoices;
  none?: string;
}

const ACTION_TYPES = TRIGGER_ACTIONS.map((a) => a.shape.type.value);
const REGION_ONLY = ['difficult', 'trap', 'level', 'reveal'];

/** The step types a tile's trigger or a region may have. */
export function stepTypes(on: 'tile' | 'region'): string[] {
  return on === 'tile' ? [...ACTION_TYPES] : [...REGION_ONLY, ...ACTION_TYPES];
}

const BLANK: Record<string, Omit<Step, 'type'>> = {
  image: { images: [] },
  visibility: { target: { coll: 'tiles', id: '' }, to: 'toggle' },
  sound: { src: '' },
  teleport: { to: [0, 0] },
  door: { wall: '', to: 'toggle' },
  message: { text: '' },
  journal: { entry: '' },
  difficult: {},
  trap: {},
  level: { to: '' },
  reveal: {},
};

export const blankStep = (type: string): Step => ({ type, ...structuredClone(BLANK[type] ?? {}) });

const FIELDS: Record<string, StepField[]> = {
  image: [
    { key: 'images', label: 'Pictures (comma between)', kind: 'list' },
    { key: 'tile', label: 'Tile', kind: 'select', choices: 'tiles', none: 'this tile' },
  ],
  visibility: [
    { key: 'target.coll', label: 'What', kind: 'select', options: [...TriggerTargetSchema.shape.coll.options] },
    { key: 'target.id', label: 'Which', kind: 'select', choices: 'target' },
    { key: 'to', label: 'Make it', kind: 'select', options: ['show', 'hide', 'toggle'] },
  ],
  sound: [
    { key: 'src', label: 'File', kind: 'text' },
    { key: 'volume', label: 'Volume (0-1)', kind: 'number' },
  ],
  teleport: [
    { key: 'to.0', label: 'To x', kind: 'number' },
    { key: 'to.1', label: 'To y', kind: 'number' },
    { key: 'scene', label: 'Scene', kind: 'select', choices: 'scenes', none: 'this scene' },
  ],
  door: [
    { key: 'wall', label: 'Door', kind: 'select', choices: 'doors' },
    { key: 'to', label: 'Make it', kind: 'select', options: ['open', 'closed', 'locked', 'toggle'] },
  ],
  message: [
    { key: 'text', label: 'Says', kind: 'text' },
    { key: 'gmOnly', label: 'To the GM only', kind: 'check' },
  ],
  journal: [
    { key: 'entry', label: 'Entry', kind: 'select', choices: 'journals' },
    { key: 'page', label: 'Page id', kind: 'text' },
  ],
  difficult: [{ key: 'multiplier', label: 'Cost ×', kind: 'number' }],
  trap: [
    { key: 'message', label: 'Trap says', kind: 'text' },
    { key: 'once', label: 'Springs once', kind: 'check' },
  ],
  level: [{ key: 'to', label: 'To level', kind: 'select', choices: 'levels' }],
  reveal: [],
};

export const stepFields = (type: string): StepField[] => FIELDS[type] ?? [];

function fieldOf(step: Step, key: string): StepField | undefined {
  return stepFields(step.type).find((f) => f.key === key);
}

/** The value a field shows: a list as comma-separated text. */
export function getStep(step: Step, key: string): FieldValue | undefined {
  const value = key.split('.').reduce<unknown>((at, part) => (at as Record<string, unknown> | undefined)?.[part], step);
  return (Array.isArray(value) ? value.join(', ') : value) as FieldValue | undefined;
}

const listOf = (value: FieldValue): string[] =>
  String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** A field's value as the step keeps it; undefined drops it. */
function typed(field: StepField | undefined, value: FieldValue): unknown {
  const kept = value === '' || value === false ? undefined : value;
  const kinds: Partial<Record<StepField['kind'], (v: FieldValue) => unknown>> = {
    list: listOf,
    number: (v) => (v === '' ? undefined : Number(v)),
  };
  return field && kinds[field.kind] ? kinds[field.kind]!(value) : kept;
}

/** Sets a field; an empty one is dropped (a point's numbers stay). */
export function setStep(step: Step, key: string, value: FieldValue): Step {
  return write(step, key.split('.'), typed(fieldOf(step, key), value)) as Step;
}

function write(at: unknown, [part, ...rest]: string[], value: unknown): unknown {
  if (Array.isArray(at)) {
    const copy = [...(at as unknown[])];
    copy[Number(part)] = (rest.length ? write(copy[Number(part)], rest, value) : value) ?? 0;
    return copy;
  }
  const { [part!]: old, ...others } = at as Record<string, unknown>;
  const here = rest.length ? write(old, rest, value) : value;
  return here === undefined ? others : { ...others, [part!]: here };
}

/** What is wrong with the steps, for the Save button to say; undefined when they are fine. */
export function problemOf(steps: readonly Step[], on: 'tile' | 'region'): string | undefined {
  const schema = on === 'tile' ? TriggerActionSchema : RegionBehaviorSchema;
  for (const [i, step] of steps.entries()) {
    const got = schema.safeParse(step);
    if (!got.success) {
      const issue = got.error.issues[0]!;
      const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
      return `Step ${i + 1} (${step.type}): ${where}${issue.message}`;
    }
  }
  return undefined;
}

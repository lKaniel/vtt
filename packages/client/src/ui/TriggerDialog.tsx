import { useState } from 'react';
import { ArrowUpIcon, PlusIcon } from 'lucide-react';
import type { Doc, Patch } from '@vtt/core';
import {
  blankStep,
  getStep,
  problemOf,
  setStep,
  type Step,
  type StepField,
  stepFields,
  stepTypes,
} from '../editor/trigger-edit.ts';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './kit/dialog.tsx';
import { Input } from './kit/input.tsx';
import { SelectField } from './kit/select.tsx';
import { RemoveButton } from './SheetDetails.tsx';

// The GM's trigger editor, like Monk's Active Tiles: a tile's chain of
// actions (and when it runs), or a region's behaviours, row by row. It saves
// as one undo step; the model is editor/trigger-edit.ts.

interface Option {
  value: string;
  label: string;
}
interface Trigger {
  on?: string;
  once?: boolean;
  gmOnly?: boolean;
  disabled?: boolean;
  actions?: Step[];
}

const named = (d: Doc): Option => ({ value: d.id, label: typeof d.name === 'string' ? `${d.name} (${d.id})` : d.id });

/** The options of a select filled from the game. */
function choicesOf(session: Session, field: StepField, step: Step): Option[] {
  const scene = session.scene;
  const lists: Record<string, () => Option[]> = {
    tiles: () =>
      session.docs
        .all(`${scene}/tiles`)
        .filter((d) => d.kind === 'image')
        .map(named),
    doors: () =>
      session.docs
        .all(`${scene}/walls`)
        .filter((d) => !!d.door)
        .map(named),
    journals: () => session.docs.all('journals').map(named),
    scenes: () => session.sceneList().map(named),
    levels: () => (session.world?.levels ?? []).map((l) => ({ value: l.id, label: l.name })),
    target: () =>
      session.docs.all(`${scene}/${(step.target as { coll?: string } | undefined)?.coll ?? 'tiles'}`).map(named),
  };
  const found = lists[field.choices!]?.() ?? [];
  return field.none ? [{ value: '', label: field.none }, ...found] : found;
}

function StepInput({
  session,
  step,
  field,
  onChange,
}: Readonly<{ session: Session; step: Step; field: StepField; onChange: (s: Step) => void }>) {
  const value = getStep(step, field.key);
  const set = (v: string | boolean) => onChange(setStep(step, field.key, v));
  if (field.kind === 'check')
    return <Checkbox aria-label={field.label} checked={value === true} onCheckedChange={(v) => set(v === true)} />;
  if (field.kind === 'select') {
    const options = field.choices
      ? choicesOf(session, field, step)
      : field.options!.map((o) => ({ value: o, label: o }));
    return (
      <SelectField
        aria-label={field.label}
        value={String(value ?? '')}
        onValueChange={set}
        options={options}
        placeholder="Pick one"
      />
    );
  }
  return (
    <Input
      aria-label={field.label}
      type={field.kind === 'number' ? 'number' : 'text'}
      value={String(value ?? '')}
      onChange={(e) => set(e.target.value)}
    />
  );
}

interface RowProps {
  session: Session;
  step: Step;
  types: string[];
  onChange: (s: Step) => void;
  onRemove: () => void;
  onUp?: () => void;
}

function StepRow({ session, step, types, onChange, onRemove, onUp }: Readonly<RowProps>) {
  return (
    <li className="art-slot flex flex-col gap-2 p-2" data-slot="trigger-step">
      <div className="flex items-center gap-2">
        <SelectField
          aria-label="Action"
          className="flex-1"
          value={step.type}
          onValueChange={(t) => onChange(blankStep(t))}
          options={types.map((t) => ({ value: t, label: t }))}
        />
        {onUp && (
          <Button variant="ghost" size="icon-sm" aria-label="Move up" title="Move up" onClick={onUp}>
            <ArrowUpIcon />
          </Button>
        )}
        <RemoveButton onClick={onRemove} />
      </div>
      {stepFields(step.type).map((f) => (
        <label key={f.key} className="grid grid-cols-[8rem_1fr] items-center gap-2 text-sm">
          <span>{f.label}</span>
          <StepInput session={session} step={step} field={f} onChange={onChange} />
        </label>
      ))}
    </li>
  );
}

function StepList({
  session,
  steps,
  on,
  onChange,
}: Readonly<{ session: Session; steps: Step[]; on: 'tile' | 'region'; onChange: (s: Step[]) => void }>) {
  const types = stepTypes(on);
  const at = (i: number, s: Step) => onChange(steps.map((x, j) => (j === i ? s : x)));
  const up = (i: number) => onChange([...steps.slice(0, i - 1), steps[i]!, steps[i - 1]!, ...steps.slice(i + 1)]);
  return (
    <>
      <ol className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
        {steps.map((step, i) => (
          <StepRow
            // Steps have no ids: a row is its place in the chain.
            key={`${i}:${step.type}`}
            session={session}
            step={step}
            types={types}
            onChange={(s) => at(i, s)}
            onRemove={() => onChange(steps.filter((_, j) => j !== i))}
            onUp={i ? () => up(i) : undefined}
          />
        ))}
      </ol>
      <Button variant="outline" size="sm" onClick={() => onChange([...steps, blankStep(types[0]!)])}>
        <PlusIcon /> Add action
      </Button>
    </>
  );
}

const TRIGGER_FLAGS = [
  ['once', 'Runs once'],
  ['gmOnly', 'GM only'],
  ['disabled', 'Turned off'],
] as const;

function TriggerOptions({ trigger, onChange }: Readonly<{ trigger: Trigger; onChange: (t: Trigger) => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <SelectField
        aria-label="When"
        value={trigger.on ?? 'click'}
        onValueChange={(on) => onChange({ ...trigger, on })}
        options={[
          { value: 'click', label: 'When clicked' },
          { value: 'enter', label: 'When walked onto' },
        ]}
      />
      {TRIGGER_FLAGS.map(([key, label]) => (
        <label key={key} className="flex items-center gap-1">
          <Checkbox
            checked={trigger[key] === true}
            onCheckedChange={(v) => onChange({ ...trigger, [key]: v === true || undefined })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}

/** The patch saving the chain: a tile's trigger, or a region's behaviours. */
function patchOf(on: 'tile' | 'region', trigger: Trigger, steps: Step[]): Patch {
  return on === 'tile' ? { trigger: { ...trigger, actions: steps } } : { behaviors: steps };
}

/** GM: edits the trigger of the one selected tile, or the behaviours of the one selected region. */
export function TriggerDialog({
  session,
  doc,
  onClose,
}: Readonly<{ session: Session; doc: Doc; onClose: () => void }>) {
  const on = doc.type === 'region' ? 'region' : 'tile';
  const saved = (doc.trigger ?? {}) as Trigger;
  const [trigger, setTrigger] = useState<Trigger>(saved);
  const [steps, setSteps] = useState<Step[]>(
    ((on === 'tile' ? saved.actions : doc.behaviors) as Step[] | undefined) ?? [],
  );
  const problem = problemOf(steps, on);
  const save = (patch: Patch) => {
    session.editEach(() => patch, on === 'tile' ? 'trigger' : 'behaviours');
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>{on === 'tile' ? 'Tile trigger' : 'Region behaviours'}</DialogTitle>
        <DialogDescription>
          {on === 'tile'
            ? 'What happens, in order, when the tile is used.'
            : 'What happens, in order, when a creature walks in.'}
        </DialogDescription>
        {on === 'tile' && <TriggerOptions trigger={trigger} onChange={setTrigger} />}
        <StepList session={session} steps={steps} on={on} onChange={setSteps} />
        {problem && <p className="text-sm text-destructive">{problem}</p>}
        <div className="flex justify-end gap-2">
          {on === 'tile' && !!doc.trigger && (
            <Button variant="ghost" onClick={() => save({ trigger: null })}>
              Remove trigger
            </Button>
          )}
          <Button disabled={!!problem} onClick={() => save(patchOf(on, trigger, steps))}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { ConditionSchema, type Effect, EffectSchema } from '@vtt/system-dnd5e';
import { Input } from '../kit/input.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { ToggleGroup, ToggleGroupItem } from '../kit/toggle-group.tsx';
import { ChangeRows } from './ChangeRows.tsx';
import { Field, Problem, useChecked } from './fields.tsx';

/** An effect made by hand: its name, how long it lasts, conditions, and changes to any statistic. */
export function EffectForm({ effect, onSave }: Readonly<{ effect: Effect; onSave: (e: Effect) => void }>) {
  const { draft, change, problem } = useChecked<Effect>(effect, EffectSchema, onSave);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Name">
        <Input value={draft.name} onChange={(e) => change({ name: e.target.value })} />
      </Field>
      <Field label="Rounds (0: until removed)">
        <NumberField
          value={draft.rounds ?? 0}
          min={0}
          max={1000}
          onValueChange={(n) => change({ rounds: n || undefined })}
        />
      </Field>
      <Field label="Conditions" wide>
        <ToggleGroup
          type="multiple"
          className="flex-wrap justify-start"
          value={draft.conditions ?? []}
          onValueChange={(v) => change({ conditions: v.length ? (v as Effect['conditions']) : undefined })}
        >
          {ConditionSchema.options.map((c) => (
            <ToggleGroupItem key={c} value={c}>
              {c}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field label="Changes" wide>
        <ChangeRows changes={draft.changes ?? []} onChange={(changes) => change({ changes })} />
      </Field>
      <div className="col-span-2">
        <Problem text={problem} />
      </div>
    </div>
  );
}

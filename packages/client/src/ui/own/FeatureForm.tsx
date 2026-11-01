import { type Feature, FeatureSchema } from '@vtt/system-dnd5e';
import { Input } from '../kit/input.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { SelectField } from '../kit/select.tsx';
import { Textarea } from '../kit/textarea.tsx';
import { Field, Problem, useChecked, NameField } from './fields.tsx';

/** A homemade feature: what it says, how often it can be used, and what using it costs. */
export function FeatureForm({ feature, onSave }: Readonly<{ feature: Feature; onSave: (f: Feature) => void }>) {
  const { draft, change, problem } = useChecked<Feature>(feature, FeatureSchema, onSave);
  const uses = draft.uses?.[0]?.[1] ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      <NameField name={draft.name} onChange={(name) => change({ name })} />
      <Field label="Uses (0: unlimited)">
        <NumberField value={uses} min={0} max={20} onValueChange={(n) => change({ uses: n ? [[1, n]] : undefined })} />
      </Field>
      <Field label="Comes back on">
        <SelectField
          value={draft.recharge}
          disabled={!uses}
          onValueChange={(r) => change({ recharge: r as Feature['recharge'] })}
          options={[
            { value: 'short', label: 'A short or long rest' },
            { value: 'long', label: 'A long rest' },
          ]}
        />
      </Field>
      <Field label="Using it takes">
        <SelectField
          value={draft.action ?? ''}
          onValueChange={(a) => change({ action: (a || undefined) as Feature['action'] })}
          options={[
            { value: '', label: 'Nothing (passive)' },
            { value: 'action', label: 'An action' },
            { value: 'bonus', label: 'A bonus action' },
            { value: 'free', label: 'No action' },
          ]}
        />
      </Field>
      <Field label="Heals on use (dice)">
        <Input
          value={draft.heal ?? ''}
          placeholder="e.g. 1d10+level"
          onChange={(e) => change({ heal: e.target.value || undefined })}
        />
      </Field>
      <Field label="Description" wide>
        <Textarea rows={5} value={draft.description} onChange={(e) => change({ description: e.target.value })} />
      </Field>
      <div className="col-span-2">
        <Problem text={problem} />
      </div>
    </div>
  );
}

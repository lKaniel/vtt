import type { Class, Feature, Subclass } from '@vtt/system-dnd5e';
import { ChevronDownIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { freshId, levelTableText, parseLevelTable, withAt, withoutAt } from '../content/homebrew-edit.ts';
import { Field, NumberInput } from './EditorFields.tsx';
import { Button } from './kit/button.tsx';
import { Input } from './kit/input.tsx';
import { NumberField } from './kit/number-field.tsx';
import { SelectField } from './kit/select.tsx';
import { Textarea } from './kit/textarea.tsx';

// The lists in the class editor: named rows with a level table (scale values,
// choices), features by level, and subclasses with their own features.

function RemoveButton({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick}>
      <XIcon />
    </Button>
  );
}

/** A name to type and a button that adds a row by it. */
function AddRow({
  placeholder,
  label,
  onAdd,
}: Readonly<{ placeholder: string; label: string; onAdd: (name: string) => void }>) {
  const [name, setName] = useState('');
  const add = () => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName('');
  };
  return (
    <div className="flex gap-1">
      <Input
        value={name}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <Button variant="outline" size="sm" disabled={!name.trim()} onClick={add}>
        {label}
      </Button>
    </div>
  );
}

/** A level table typed as text, read when the field is left. */
function TableInput({
  value,
  label,
  onCommit,
}: Readonly<{ value: string; label: string; onCommit: (text: string) => void }>) {
  const [text, setText] = useState(value);
  return (
    <Input
      value={text}
      placeholder="1: 2, 5: 3"
      aria-label={label}
      title={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(levelTableText(parseLevelTable(text)))}
    />
  );
}

export interface NamedRow {
  id: string;
  name: string;
  table: string;
}

export function NamedRows({
  rows,
  tableLabel,
  placeholder,
  onChange,
}: Readonly<{ rows: NamedRow[]; tableLabel: string; placeholder: string; onChange: (rows: NamedRow[]) => void }>) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-1">
          <Input
            className="w-36"
            value={r.name}
            aria-label="Name"
            onChange={(e) => onChange(withAt(rows, i, { ...r, name: e.target.value }))}
          />
          <TableInput
            value={r.table}
            label={tableLabel}
            onCommit={(table) => onChange(withAt(rows, i, { ...r, table }))}
          />
          <RemoveButton label={`Remove ${r.name}`} onClick={() => onChange(withoutAt(rows, i))} />
        </div>
      ))}
      <AddRow
        placeholder={placeholder}
        label="Add"
        onAdd={(name) => onChange([...rows, { id: freshId(name, rows), name, table: '1: 1' }])}
      />
    </div>
  );
}

const RECHARGE = [
  { value: 'long', label: 'Long rest' },
  { value: 'short', label: 'Short rest' },
  { value: 'short-one', label: 'One back on a short rest' },
];
const ACTIONS = [
  { value: '', label: 'Passive' },
  { value: 'action', label: 'Action' },
  { value: 'bonus', label: 'Bonus action' },
  { value: 'attack', label: 'One attack' },
  { value: 'free', label: 'Free' },
];

interface FeatureListProps {
  features: Feature[];
  /** The class's choices: a feature may be an option of one. */
  choices: readonly { id: string; name: string }[];
  onChange: (features: Feature[]) => void;
}

export function FeatureList({ features, choices, onChange }: Readonly<FeatureListProps>) {
  const sorted = features.map((f, i) => ({ f, i })).sort((a, b) => a.f.level - b.f.level);
  return (
    <div className="flex flex-col gap-1" data-slot="feature-list">
      {sorted.map(({ f, i }) => (
        <FeatureRow
          key={f.id}
          feature={f}
          choices={choices}
          onChange={(next) => onChange(withAt(features, i, next))}
          onRemove={() => onChange(withoutAt(features, i))}
        />
      ))}
      <AddRow
        placeholder="Feature name"
        label="Add feature"
        onAdd={(name) =>
          onChange([...features, { id: freshId(name, features), name, level: 1, description: '', recharge: 'long' }])
        }
      />
    </div>
  );
}

interface FeatureRowProps {
  feature: Feature;
  choices: FeatureListProps['choices'];
  onChange: (f: Feature) => void;
  onRemove: () => void;
}

function FeatureRow({ feature, choices, onChange, onRemove }: Readonly<FeatureRowProps>) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Feature>) => onChange({ ...feature, ...patch });
  const options = [
    { value: '', label: 'Always' },
    ...choices.map((c) => ({ value: c.id, label: `Option: ${c.name}` })),
  ];
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-1.5">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Details" onClick={() => setOpen(!open)}>
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Button>
        <Input
          className="flex-1"
          value={feature.name}
          aria-label="Feature name"
          onChange={(e) => set({ name: e.target.value })}
        />
        <NumberField
          className="w-28"
          aria-label="Level"
          value={feature.level}
          min={1}
          max={20}
          onValueChange={(level) => set({ level })}
        />
        {choices.length > 0 && (
          <div className="w-48">
            <SelectField
              value={feature.choice ?? ''}
              onValueChange={(c) => set({ choice: c || undefined })}
              options={options}
              aria-label="Given"
            />
          </div>
        )}
        <RemoveButton label={`Remove ${feature.name}`} onClick={onRemove} />
      </div>
      {open && <FeatureDetails feature={feature} set={set} />}
    </div>
  );
}

function FeatureDetails({ feature, set }: Readonly<{ feature: Feature; set: (patch: Partial<Feature>) => void }>) {
  return (
    <div className="ed-grid items-end">
      <Field label="Description" wide>
        <Textarea value={feature.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <Field label="Uses by level">
        <TableInput
          value={levelTableText(feature.uses)}
          label="Uses by level"
          onCommit={(text) => set({ uses: text ? parseLevelTable(text) : undefined })}
        />
      </Field>
      <Field label="Comes back">
        <SelectField
          value={feature.recharge}
          onValueChange={(r) => set({ recharge: r as Feature['recharge'] })}
          options={RECHARGE}
          aria-label="Comes back"
        />
      </Field>
      <Field label="Takes">
        <SelectField
          value={feature.action ?? ''}
          onValueChange={(a) => set({ action: (a || undefined) as Feature['action'] })}
          options={ACTIONS}
          aria-label="Takes"
        />
      </Field>
    </div>
  );
}

export function SubclassList({ draft, set }: Readonly<{ draft: Class; set: (patch: Partial<Class>) => void }>) {
  const subclasses = draft.subclasses ?? [];
  const change = (next: Subclass[]) => set({ subclasses: next.length ? next : undefined });
  return (
    <div className="flex flex-col gap-2" data-slot="subclasses">
      <Field label="Chosen at level">
        <NumberInput
          value={draft.subclassLevel}
          min={1}
          placeholder="none"
          onChange={(subclassLevel) => set({ subclassLevel })}
        />
      </Field>
      {subclasses.map((s, i) => (
        <section key={s.id} className="flex flex-col gap-1 rounded-md border border-border p-2">
          <div className="flex items-center gap-1">
            <Input
              className="flex-1"
              value={s.name}
              aria-label="Subclass name"
              onChange={(e) => change(withAt(subclasses, i, { ...s, name: e.target.value }))}
            />
            <RemoveButton label={`Remove ${s.name}`} onClick={() => change(withoutAt(subclasses, i))} />
          </div>
          <Textarea
            value={s.description}
            aria-label="Subclass description"
            onChange={(e) => change(withAt(subclasses, i, { ...s, description: e.target.value }))}
          />
          <FeatureList
            features={s.features}
            choices={[]}
            onChange={(features) => change(withAt(subclasses, i, { ...s, features }))}
          />
        </section>
      ))}
      <AddRow
        placeholder="Subclass name"
        label="Add subclass"
        onAdd={(name) =>
          change([...subclasses, { id: freshId(name, subclasses), name, description: '', features: [] }])
        }
      />
    </div>
  );
}

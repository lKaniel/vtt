import { PlusIcon } from 'lucide-react';
import {
  CHANGE_KEYS,
  CHANGE_MODES,
  type ChangeKey,
  type ChangeMode,
  DamageTypeSchema,
  type EffectChange,
  keyName,
  LIST_KEYS,
} from '@vtt/system-dnd5e';
import { blankChange } from '../../effect-edit.ts';
import { Button } from '../kit/button.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { SelectField } from '../kit/select.tsx';
import { RemoveButton } from '../SheetDetails.tsx';
import { choices } from './fields.tsx';

const KEY_OPTIONS = CHANGE_KEYS.map((k) => ({ value: k, label: keyName(k) }));
const MODE_LABELS: Record<ChangeMode, string> = {
  add: 'Add',
  multiply: 'Multiply by',
  downgrade: 'At most',
  upgrade: 'At least',
  override: 'Set to',
};
const MODE_OPTIONS = CHANGE_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }));
const TYPE_OPTIONS = choices(DamageTypeSchema.options);
const isList = (key: ChangeKey) => (LIST_KEYS as readonly string[]).includes(key);

/** A new key keeps the value when it still fits (a number for a number), else starts afresh. */
function rekeyed(c: EffectChange, key: ChangeKey): EffectChange {
  if (isList(key)) return { key, mode: 'add', value: isList(c.key) ? c.value : 'fire' };
  return { key, mode: c.mode, value: isList(c.key) ? 1 : c.value };
}

function ChangeRow({ change, onChange }: Readonly<{ change: EffectChange; onChange: (c: EffectChange) => void }>) {
  const list = isList(change.key);
  return (
    <>
      <SelectField
        aria-label="Changes"
        value={change.key}
        onValueChange={(k) => onChange(rekeyed(change, k as ChangeKey))}
        options={KEY_OPTIONS}
      />
      {list ? (
        <SelectField
          aria-label="Damage type"
          className="col-span-2"
          value={String(change.value)}
          onValueChange={(value) => onChange({ ...change, value })}
          options={TYPE_OPTIONS}
        />
      ) : (
        <>
          <SelectField
            aria-label="How"
            value={change.mode}
            onValueChange={(m) => onChange({ ...change, mode: m as ChangeMode })}
            options={MODE_OPTIONS}
          />
          <NumberField
            aria-label="By"
            value={Number(change.value)}
            min={-99}
            max={99}
            step={change.mode === 'multiply' ? 0.5 : 1}
            onValueChange={(value) => onChange({ ...change, value })}
          />
        </>
      )}
    </>
  );
}

/** Foundry-style changes by key: each row names a statistic, how it changes, and by what. */
export function ChangeRows({
  changes,
  onChange,
}: Readonly<{ changes: readonly EffectChange[]; onChange: (changes: EffectChange[]) => void }>) {
  const set = (i: number, c: EffectChange) => onChange(changes.map((x, j) => (j === i ? c : x)));
  return (
    <div className="flex flex-col gap-2" data-slot="change-rows">
      {changes.length > 0 && (
        <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-2">
          {changes.map((c, i) => (
            <div key={i} className="contents">
              <ChangeRow change={c} onChange={(next) => set(i, next)} />
              <RemoveButton onClick={() => onChange(changes.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
      )}
      <div>
        <Button variant="outline" size="sm" onClick={() => onChange([...changes, blankChange()])}>
          <PlusIcon /> Add a change
        </Button>
      </div>
    </div>
  );
}

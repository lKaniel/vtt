import { AuraSchema, ConditionSchema, type Effect, EffectSchema } from '@vtt/system-dnd5e';
import { setAura } from '../../content/effect-edit.ts';
import { SelectField } from '../kit/select.tsx';
import { Input } from '../kit/input.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { ToggleGroup, ToggleGroupItem } from '../kit/toggle-group.tsx';
import { ChangeRows } from './ChangeRows.tsx';
import { Field, Problem, useChecked } from './fields.tsx';
import { t } from '../../i18n/index.ts';

/** An effect made by hand: its name, how long it lasts, conditions, and changes to any statistic. */
export function EffectForm({ effect, onSave }: Readonly<{ effect: Effect; onSave: (e: Effect) => void }>) {
  const { draft, change, problem } = useChecked<Effect>(effect, EffectSchema, onSave);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t('own.name')}>
        <Input value={draft.name} onChange={(e) => change({ name: e.target.value })} />
      </Field>
      <Field label={t('own.effect.rounds')}>
        <NumberField
          value={draft.rounds ?? 0}
          min={0}
          max={1000}
          onValueChange={(n) => change({ rounds: n || undefined })}
        />
      </Field>
      <Field label={t('own.effect.conditions')} wide>
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
      <Field label={t('own.effect.aura')}>
        <NumberField
          value={draft.aura?.radius ?? 0}
          min={0}
          max={300}
          step={5}
          onValueChange={(radius) => change({ aura: setAura(draft, { radius }).aura })}
        />
      </Field>
      {draft.aura && (
        <Field label={t('own.effect.auraWho')}>
          <SelectField
            value={draft.aura.who}
            onValueChange={(who) => change({ aura: setAura(draft, { who: who as 'allies' }).aura })}
            options={AuraSchema.shape.who.unwrap().options.map((w) => ({ value: w, label: w }))}
          />
        </Field>
      )}
      <Field label={t('own.effect.changes')} wide>
        <ChangeRows changes={draft.changes ?? []} onChange={(changes) => change({ changes })} />
      </Field>
      <div className="col-span-2">
        <Problem text={problem} />
      </div>
    </div>
  );
}

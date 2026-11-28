import { type Feature, FeatureSchema } from '@vtt/system-dnd5e';
import { Input } from '../kit/input.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { SelectField } from '../kit/select.tsx';
import { Textarea } from '../kit/textarea.tsx';
import { ChangeRows } from './ChangeRows.tsx';
import { Field, Problem, useChecked, NameField } from './fields.tsx';
import { t } from '../../i18n/index.ts';

/** A homemade feature: what it says, how often it can be used, and what using it costs. */
export function FeatureForm({ feature, onSave }: Readonly<{ feature: Feature; onSave: (f: Feature) => void }>) {
  const { draft, change, problem } = useChecked<Feature>(feature, FeatureSchema, onSave);
  const uses = draft.uses?.[0]?.[1] ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      <NameField name={draft.name} onChange={(name) => change({ name })} />
      <Field label={t('own.feature.uses')}>
        <NumberField value={uses} min={0} max={20} onValueChange={(n) => change({ uses: n ? [[1, n]] : undefined })} />
      </Field>
      <Field label={t('own.feature.recharge')}>
        <SelectField
          value={draft.recharge}
          disabled={!uses}
          onValueChange={(r) => change({ recharge: r as Feature['recharge'] })}
          options={[
            { value: 'short', label: t('own.feature.short') },
            { value: 'long', label: t('own.feature.long') },
          ]}
        />
      </Field>
      <Field label={t('own.feature.takes')}>
        <SelectField
          value={draft.action ?? ''}
          onValueChange={(a) => change({ action: (a || undefined) as Feature['action'] })}
          options={[
            { value: '', label: t('own.feature.passive') },
            { value: 'action', label: t('own.feature.action') },
            { value: 'bonus', label: t('own.feature.bonus') },
            { value: 'attack', label: t('own.feature.attack') },
            { value: 'free', label: t('own.feature.free') },
          ]}
        />
      </Field>
      <Field label={t('own.feature.heal')}>
        <Input
          value={draft.heal ?? ''}
          placeholder={t('own.feature.healHint')}
          onChange={(e) => change({ heal: e.target.value || undefined })}
        />
      </Field>
      <Field label={t('own.feature.alwaysOn')} wide>
        <ChangeRows
          changes={draft.passive?.changes ?? []}
          onChange={(changes) => change({ passive: passiveWith(draft.passive, changes) })}
        />
      </Field>
      <Field label={t('own.description')} wide>
        <Textarea rows={5} value={draft.description} onChange={(e) => change({ description: e.target.value })} />
      </Field>
      <div className="col-span-2">
        <Problem text={problem} />
      </div>
    </div>
  );
}

/** The feature's always-on effect with these changes; none left drops an effect that only held changes. */
function passiveWith(
  passive: Feature['passive'],
  changes: NonNullable<Feature['passive']>['changes'],
): Feature['passive'] {
  const rest = { ...passive, changes: changes?.length ? changes : undefined };
  return Object.values(rest).some((v) => v !== undefined) ? rest : undefined;
}

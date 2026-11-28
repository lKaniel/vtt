import { AbilitySchema, CastingTimeSchema, DamageTypeSchema, type Spell, SpellSchema } from '@vtt/system-dnd5e';
import { Checkbox } from '../kit/checkbox.tsx';
import { Input } from '../kit/input.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { SelectField } from '../kit/select.tsx';
import { Textarea } from '../kit/textarea.tsx';
import { choices, Field, Problem, useChecked, NameField } from './fields.tsx';
import { t } from '../../i18n/index.ts';

const SCHOOLS = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
];
const CASTING = {
  action: 'spellForm.action',
  bonus: 'spellForm.bonus',
  reaction: 'spellForm.reaction',
  minute: 'spellForm.minute',
  hour: 'spellForm.hour',
} as const;

/** A homemade spell: its level and casting, and what it does (an attack or save, damage or healing). */
export function SpellForm({ spell, onSave }: Readonly<{ spell: Spell; onSave: (spell: Spell) => void }>) {
  const { draft, change, problem } = useChecked<Spell>(spell, SpellSchema, onSave);
  return (
    <div className="grid grid-cols-2 gap-3">
      <NameField name={draft.name} onChange={(name) => change({ name })} />
      <Field label={t('spellForm.level')}>
        <NumberField value={draft.level} min={0} max={9} onValueChange={(level) => change({ level })} />
      </Field>
      <Field label={t('spellForm.school')}>
        <SelectField value={draft.school} onValueChange={(school) => change({ school })} options={choices(SCHOOLS)} />
      </Field>
      <Field label={t('spellForm.casting')}>
        <SelectField
          value={draft.castingTime}
          onValueChange={(v) => change({ castingTime: v as Spell['castingTime'] })}
          options={CastingTimeSchema.options.map((c) => ({ value: c, label: t(CASTING[c]) }))}
        />
      </Field>
      <Field label={t('spellForm.range')}>
        <NumberField value={draft.range} min={0} step={5} onValueChange={(range) => change({ range })} />
      </Field>
      <Field label={t('spellForm.duration')}>
        <Input value={draft.duration} onChange={(e) => change({ duration: e.target.value })} />
      </Field>
      <Field label={t('spellForm.concentration')}>
        <Checkbox checked={draft.concentration} onCheckedChange={(on) => change({ concentration: on === true })} />
      </Field>
      <SpellEffectFields spell={draft} change={change} />
      <Field label={t('own.description')} wide>
        <Textarea rows={4} value={draft.description} onChange={(e) => change({ description: e.target.value })} />
      </Field>
      <div className="col-span-2">
        <Problem text={problem} />
      </div>
    </div>
  );
}

/** The select's value for how a spell lands. */
function rollOf(spell: Spell): string {
  if (spell.attack) return `attack-${spell.attack}`;
  return spell.save ? `save-${spell.save.ability}` : '';
}

/** How it lands (an attack roll, a saving throw or neither) and its damage or healing. */
function SpellEffectFields({ spell, change }: Readonly<{ spell: Spell; change: (p: Partial<Spell>) => void }>) {
  const roll = rollOf(spell);
  const setRoll = (v: string) => {
    if (v.startsWith('attack-')) change({ attack: v.slice(7) as Spell['attack'], save: undefined });
    else if (v.startsWith('save-'))
      change({ attack: undefined, save: { ability: v.slice(5) as never, onSave: 'half', onCast: true } });
    else change({ attack: undefined, save: undefined });
  };
  const hit = spell.damage[0];
  return (
    <>
      <Field label={t('spellForm.lands')} wide>
        <SelectField
          value={roll}
          onValueChange={setRoll}
          options={[
            { value: '', label: t('spellForm.always') },
            { value: 'attack-melee', label: t('spellForm.melee') },
            { value: 'attack-ranged', label: t('spellForm.ranged') },
            ...AbilitySchema.options.map((a) => ({
              value: `save-${a}`,
              label: t('spellForm.save', { ability: a.toUpperCase() }),
            })),
          ]}
        />
      </Field>
      <Field label={t('spellForm.damage')}>
        <Input
          value={hit?.dice ?? ''}
          placeholder={t('spellForm.damageHint')}
          onChange={(e) =>
            change({ damage: e.target.value ? [{ dice: e.target.value, type: hit?.type ?? 'force' }] : [] })
          }
        />
      </Field>
      <Field label={t('spellForm.damageType')}>
        <SelectField
          value={hit?.type ?? 'force'}
          disabled={!hit}
          onValueChange={(v) => hit && change({ damage: [{ ...hit, type: v as typeof hit.type }] })}
          options={choices(DamageTypeSchema.options)}
        />
      </Field>
      <Field label={t('spellForm.heal')} wide>
        <Input
          value={spell.heal ?? ''}
          placeholder={t('spellForm.healHint')}
          onChange={(e) => change({ heal: e.target.value || undefined })}
        />
      </Field>
    </>
  );
}

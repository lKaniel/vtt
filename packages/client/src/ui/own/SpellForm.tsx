import { AbilitySchema, CastingTimeSchema, DamageTypeSchema, type Spell, SpellSchema } from '@vtt/system-dnd5e';
import { Checkbox } from '../kit/checkbox.tsx';
import { Input } from '../kit/input.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { SelectField } from '../kit/select.tsx';
import { Textarea } from '../kit/textarea.tsx';
import { choices, Field, Problem, useChecked, NameField } from './fields.tsx';

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
const CASTING = { action: 'Action', bonus: 'Bonus action', reaction: 'Reaction', minute: '1 minute', hour: '1 hour' };

/** A homemade spell: its level and casting, and what it does (an attack or save, damage or healing). */
export function SpellForm({ spell, onSave }: Readonly<{ spell: Spell; onSave: (spell: Spell) => void }>) {
  const { draft, change, problem } = useChecked<Spell>(spell, SpellSchema, onSave);
  return (
    <div className="grid grid-cols-2 gap-3">
      <NameField name={draft.name} onChange={(name) => change({ name })} />
      <Field label="Level (0: cantrip)">
        <NumberField value={draft.level} min={0} max={9} onValueChange={(level) => change({ level })} />
      </Field>
      <Field label="School">
        <SelectField value={draft.school} onValueChange={(school) => change({ school })} options={choices(SCHOOLS)} />
      </Field>
      <Field label="Casting time">
        <SelectField
          value={draft.castingTime}
          onValueChange={(t) => change({ castingTime: t as Spell['castingTime'] })}
          options={CastingTimeSchema.options.map((t) => ({ value: t, label: CASTING[t] }))}
        />
      </Field>
      <Field label="Range (ft, 0: self)">
        <NumberField value={draft.range} min={0} step={5} onValueChange={(range) => change({ range })} />
      </Field>
      <Field label="Duration">
        <Input value={draft.duration} onChange={(e) => change({ duration: e.target.value })} />
      </Field>
      <Field label="Concentration">
        <Checkbox checked={draft.concentration} onCheckedChange={(on) => change({ concentration: on === true })} />
      </Field>
      <SpellEffectFields spell={draft} change={change} />
      <Field label="Description" wide>
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
      change({ attack: undefined, save: { ability: v.slice(5) as never, onSave: 'half' } });
    else change({ attack: undefined, save: undefined });
  };
  const hit = spell.damage[0];
  return (
    <>
      <Field label="Lands with" wide>
        <SelectField
          value={roll}
          onValueChange={setRoll}
          options={[
            { value: '', label: 'Always (no roll)' },
            { value: 'attack-melee', label: 'Melee spell attack' },
            { value: 'attack-ranged', label: 'Ranged spell attack' },
            ...AbilitySchema.options.map((a) => ({ value: `save-${a}`, label: `${a.toUpperCase()} saving throw` })),
          ]}
        />
      </Field>
      <Field label="Damage (dice)">
        <Input
          value={hit?.dice ?? ''}
          placeholder="e.g. 2d8"
          onChange={(e) =>
            change({ damage: e.target.value ? [{ dice: e.target.value, type: hit?.type ?? 'force' }] : [] })
          }
        />
      </Field>
      <Field label="Damage type">
        <SelectField
          value={hit?.type ?? 'force'}
          disabled={!hit}
          onValueChange={(t) => hit && change({ damage: [{ ...hit, type: t as typeof hit.type }] })}
          options={choices(DamageTypeSchema.options)}
        />
      </Field>
      <Field label="Heals (dice)" wide>
        <Input
          value={spell.heal ?? ''}
          placeholder="e.g. 1d8"
          onChange={(e) => change({ heal: e.target.value || undefined })}
        />
      </Field>
    </>
  );
}

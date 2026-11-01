import { DamageTypeSchema, type Item, ItemSchema, WeaponPropertySchema } from '@vtt/system-dnd5e';
import { Checkbox } from '../kit/checkbox.tsx';
import { Input } from '../kit/input.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { SelectField } from '../kit/select.tsx';
import { Textarea } from '../kit/textarea.tsx';
import { Toggle } from '../kit/toggle.tsx';
import { choices, Field, Problem, useChecked, NameField } from './fields.tsx';

type Weapon = Extract<Item, { type: 'weapon' }>;
type Armor = Extract<Item, { type: 'armor' }>;
type Gear = Extract<Item, { type: 'gear' }>;

/** `item` as another type: its name and weight stay, the rest starts plain. */
function retype(item: Item, type: Item['type']): Item {
  const base = { id: item.id, name: item.name, weight: item.weight };
  if (type === 'weapon')
    return {
      ...base,
      type,
      category: 'simple',
      kind: 'melee',
      damage: { dice: '1d6', type: 'slashing' },
      properties: [],
    };
  if (type === 'armor') return { ...base, type, category: 'light', ac: 11, stealthDisadvantage: false };
  return { ...base, type: 'gear' };
}

/** A homemade item: what it is, and what it does as gear, a weapon or armour. */
export function ItemForm({ item, onSave }: Readonly<{ item: Item; onSave: (item: Item) => void }>) {
  const { draft, change, replace, problem } = useChecked<Item>(item, ItemSchema, onSave);
  return (
    <div className="grid grid-cols-2 gap-3">
      <NameField name={draft.name} onChange={(name) => change({ name })} />
      <Field label="Kind">
        <SelectField
          value={draft.type}
          onValueChange={(t) => replace(retype(draft, t as Item['type']))}
          options={[
            { value: 'gear', label: 'Gear' },
            { value: 'weapon', label: 'Weapon' },
            { value: 'armor', label: 'Armour' },
          ]}
        />
      </Field>
      <Field label="Weight (lb)">
        <NumberField value={draft.weight} min={0} onValueChange={(weight) => change({ weight })} />
      </Field>
      {draft.type === 'gear' && <GearFields gear={draft} change={change} />}
      {draft.type === 'weapon' && <WeaponFields weapon={draft} change={change} />}
      {draft.type === 'armor' && <ArmorFields armor={draft} change={change} />}
      <div className="col-span-2">
        <Problem text={problem} />
      </div>
    </div>
  );
}

function GearFields({ gear, change }: Readonly<{ gear: Gear; change: (p: Partial<Gear>) => void }>) {
  const use = gear.use ?? { potion: false };
  return (
    <>
      <Field label="Heals when used (dice)">
        <Input
          value={use.heal ?? ''}
          placeholder="e.g. 2d4+2"
          onChange={(e) => change({ use: e.target.value ? { ...use, heal: e.target.value } : undefined })}
        />
      </Field>
      <Field label="A potion">
        <Checkbox
          checked={use.potion}
          disabled={!use.heal}
          onCheckedChange={(on) => change({ use: { ...use, potion: on === true } })}
        />
      </Field>
      <Field label="Description" wide>
        <Textarea
          rows={4}
          value={gear.description ?? ''}
          onChange={(e) => change({ description: e.target.value || undefined })}
        />
      </Field>
    </>
  );
}

function WeaponFields({ weapon, change }: Readonly<{ weapon: Weapon; change: (p: Partial<Weapon>) => void }>) {
  const toggle = (p: Weapon['properties'][number]) =>
    change({
      properties: weapon.properties.includes(p) ? weapon.properties.filter((x) => x !== p) : [...weapon.properties, p],
    });
  return (
    <>
      <Field label="Damage">
        <Input
          value={weapon.damage.dice}
          onChange={(e) => change({ damage: { ...weapon.damage, dice: e.target.value } })}
        />
      </Field>
      <Field label="Damage type">
        <SelectField
          value={weapon.damage.type}
          onValueChange={(t) => change({ damage: { ...weapon.damage, type: t as Weapon['damage']['type'] } })}
          options={choices(DamageTypeSchema.options)}
        />
      </Field>
      <Field label="Category">
        <SelectField
          value={weapon.category}
          onValueChange={(c) => change({ category: c as Weapon['category'] })}
          options={choices(['simple', 'martial'])}
        />
      </Field>
      <Field label="Melee or ranged">
        <SelectField
          value={weapon.kind}
          onValueChange={(k) => change({ kind: k as Weapon['kind'], range: k === 'ranged' ? [80, 320] : undefined })}
          options={choices(['melee', 'ranged'])}
        />
      </Field>
      <Field label="Properties" wide>
        <div className="flex flex-wrap gap-1.5">
          {WeaponPropertySchema.options.map((p) => (
            <Toggle key={p} pressed={weapon.properties.includes(p)} onPressedChange={() => toggle(p)}>
              {p}
            </Toggle>
          ))}
        </div>
      </Field>
    </>
  );
}

function ArmorFields({ armor, change }: Readonly<{ armor: Armor; change: (p: Partial<Armor>) => void }>) {
  return (
    <>
      <Field label="Category">
        <SelectField
          value={armor.category}
          onValueChange={(c) => change({ category: c as Armor['category'] })}
          options={choices(['light', 'medium', 'heavy', 'shield'])}
        />
      </Field>
      <Field label={armor.category === 'shield' ? 'AC bonus' : 'Base AC'}>
        <NumberField value={armor.ac} min={0} max={30} onValueChange={(ac) => change({ ac })} />
      </Field>
      <Field label="Stealth disadvantage">
        <Checkbox
          checked={armor.stealthDisadvantage}
          onCheckedChange={(on) => change({ stealthDisadvantage: on === true })}
        />
      </Field>
    </>
  );
}

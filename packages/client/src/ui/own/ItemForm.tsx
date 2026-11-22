import { diceFormula } from '@vtt/shared';
import { type Item, ItemSchema, RaritySchema } from '@vtt/system-dnd5e';
import { t } from '../../i18n/index.ts';
import { Checkbox } from '../kit/checkbox.tsx';
import { Input } from '../kit/input.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { SelectField } from '../kit/select.tsx';
import { Textarea } from '../kit/textarea.tsx';
import { ChangeRows } from './ChangeRows.tsx';
import { type Checks, choices, Field, Problem, useChecked, NameField } from './fields.tsx';
import { WeaponFields } from './WeaponForm.tsx';

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

/** Why `dice` can't be rolled, or undefined when it can. */
const diceProblem = (what: string, dice: string | undefined) =>
  dice === undefined || diceFormula(dice) ? undefined : t('item.form.badDice', { what, dice });

/** The item's dice, tidied the way they roll ("1В10 + 3" is saved as "1d10+3"). */
function tidyDice(item: Item): Item {
  if (item.type === 'weapon') return { ...item, damage: { ...item.damage, dice: diceFormula(item.damage.dice)! } };
  const heal = item.type === 'gear' ? item.use?.heal : undefined;
  return heal && item.type === 'gear' ? { ...item, use: { ...item.use!, heal: diceFormula(heal)! } } : item;
}

/** Why the item's damage or healing dice can't be rolled, if they can't. */
function itemDiceProblem(item: Item): string | undefined {
  if (item.type === 'weapon') return diceProblem(t('item.form.damage'), item.damage.dice);
  if (item.type === 'gear') return diceProblem(t('item.form.healing'), item.use?.heal);
  return undefined;
}

/** ItemSchema, and dice that roll: a typo'd damage is shown, not saved. */
const itemChecks: Checks<Item> = {
  safeParse(value) {
    const item = value as Item;
    const problem = itemDiceProblem(item);
    if (problem) return { success: false, error: { issues: [{ message: problem }] } };
    const parsed = ItemSchema.safeParse(item);
    if (parsed.success) return { success: true, data: tidyDice(parsed.data) };
    return { success: false, error: { issues: parsed.error.issues } };
  },
};

/** A homemade item: what it is, and what it does as gear, a weapon or armour. */
export function ItemForm({ item, onSave }: Readonly<{ item: Item; onSave: (item: Item) => void }>) {
  const { draft, change, replace, problem } = useChecked<Item>(item, itemChecks, onSave);
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
      <MagicFields item={draft} change={change} />
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

/** What every item may be: described, magic, rare, attuned, and what it does while equipped. */
function MagicFields({ item, change }: Readonly<{ item: Item; change: (p: Partial<Item>) => void }>) {
  const changes = item.effect?.changes ?? [];
  const setChanges = (next: typeof changes) => {
    const effect = { ...item.effect, changes: next.length ? next : undefined };
    change({ effect: Object.values(effect).some((v) => v !== undefined) ? effect : undefined });
  };
  return (
    <>
      <Field label={t('item.form.rarity')}>
        <SelectField
          value={item.rarity ?? ''}
          onValueChange={(r) => change({ rarity: (r || undefined) as Item['rarity'] })}
          options={[{ value: '', label: t('item.form.noRarity') }, ...choices(RaritySchema.options)]}
        />
      </Field>
      <Field label={t('item.form.magic')}>
        <Checkbox checked={item.magic === true} onCheckedChange={(on) => change({ magic: on === true || undefined })} />
      </Field>
      <Field label={t('item.form.attunement')}>
        <Checkbox
          checked={item.attunement === true}
          onCheckedChange={(on) => change({ attunement: on === true || undefined })}
        />
      </Field>
      <Field label={t('item.form.whileEquipped')} wide>
        <ChangeRows changes={changes} onChange={setChanges} />
      </Field>
      <Field label={t('item.form.description')} wide>
        <Textarea
          rows={4}
          value={item.description ?? ''}
          onChange={(e) => change({ description: e.target.value || undefined })}
        />
      </Field>
    </>
  );
}

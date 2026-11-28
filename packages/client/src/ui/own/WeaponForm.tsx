import {
  ABILITIES,
  ConditionSchema,
  DamageTypeSchema,
  damageText,
  type Item,
  type OnHit,
  typedDamage,
  WeaponPropertySchema,
} from '@vtt/system-dnd5e';
import { useState } from 'react';
import { t } from '../../i18n/index.ts';
import { Checkbox } from '../kit/checkbox.tsx';
import { Input } from '../kit/input.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { SelectField } from '../kit/select.tsx';
import { Toggle } from '../kit/toggle.tsx';
import { choices, Field } from './fields.tsx';

// A weapon in the item editor: its dice and type, or formulas as free as
// "1d10 psychic + 1d6 fire + 2*dex + prof" for damage and "dex + prof + 1"
// for the attack (system-dnd5e weapon-formula.ts), its properties, range,
// magic bonus, and what rides on its hit (a save, damage, conditions).

type Weapon = Extract<Item, { type: 'weapon' }>;
type Change = (p: Partial<Weapon>) => void;

export function WeaponFields({ weapon, change }: Readonly<{ weapon: Weapon; change: Change }>) {
  return (
    <>
      <DamageFields weapon={weapon} change={change} />
      <FormulaFields weapon={weapon} change={change} />
      <Field label={t('weaponForm.category')}>
        <SelectField
          value={weapon.category}
          onValueChange={(c) => change({ category: c as Weapon['category'] })}
          options={choices(['simple', 'martial'])}
        />
      </Field>
      <Field label={t('weaponForm.meleeOrRanged')}>
        <SelectField
          value={weapon.kind}
          onValueChange={(k) => change({ kind: k as Weapon['kind'], range: k === 'ranged' ? [80, 320] : undefined })}
          options={choices(['melee', 'ranged'])}
        />
      </Field>
      <Field label={t('item.form.magicBonus')}>
        <NumberField
          value={weapon.plus ?? 0}
          min={0}
          max={3}
          onValueChange={(plus) => change({ plus: plus || undefined })}
        />
      </Field>
      {weapon.kind === 'ranged' && <RangeFields weapon={weapon} change={change} />}
      <p className="col-span-2 text-xs text-muted-foreground">{t('item.form.weaponNote')}</p>
      <Properties weapon={weapon} change={change} />
      <OnHitFields onHit={weapon.onHit} set={(onHit) => change({ onHit })} />
    </>
  );
}

function DamageFields({ weapon, change }: Readonly<{ weapon: Weapon; change: Change }>) {
  return (
    <>
      <Field label={t('item.form.damageDice')}>
        <Input
          value={weapon.damage.dice}
          placeholder="e.g. 1d10"
          onChange={(e) => change({ damage: { ...weapon.damage, dice: e.target.value } })}
        />
      </Field>
      <Field label={t('item.form.damageType')}>
        <SelectField
          value={weapon.damage.type}
          onValueChange={(type) => change({ damage: { ...weapon.damage, type: type as Weapon['damage']['type'] } })}
          options={choices(DamageTypeSchema.options)}
        />
      </Field>
    </>
  );
}

/** The damage and attack formulas; empty leaves the usual modifier and proficiency. */
function FormulaFields({ weapon, change }: Readonly<{ weapon: Weapon; change: Change }>) {
  const set = (key: 'damage' | 'hit', text: string) => {
    const formula = { ...weapon.formula, [key]: text.trim() ? text : undefined };
    change({ formula: formula.damage || formula.hit ? formula : undefined });
  };
  return (
    <>
      <Field label={t('item.form.damageFormula')} wide>
        <Input
          value={weapon.formula?.damage ?? ''}
          placeholder={t('item.form.damageFormulaHint')}
          onChange={(e) => set('damage', e.target.value)}
        />
      </Field>
      <Field label={t('item.form.hitFormula')}>
        <Input
          value={weapon.formula?.hit ?? ''}
          placeholder={t('item.form.hitFormulaHint')}
          onChange={(e) => set('hit', e.target.value)}
        />
      </Field>
      <p className="col-span-2 text-xs text-muted-foreground">{t('item.form.formulaNote')}</p>
    </>
  );
}

function Properties({ weapon, change }: Readonly<{ weapon: Weapon; change: Change }>) {
  const toggle = (p: Weapon['properties'][number]) =>
    change({
      properties: weapon.properties.includes(p) ? weapon.properties.filter((x) => x !== p) : [...weapon.properties, p],
    });
  return (
    <Field label={t('weaponForm.properties')} wide>
      <div className="flex flex-wrap gap-1.5">
        {WeaponPropertySchema.options.map((p) => (
          <Toggle key={p} pressed={weapon.properties.includes(p)} onPressedChange={() => toggle(p)}>
            {p}
          </Toggle>
        ))}
      </div>
    </Field>
  );
}

function RangeFields({ weapon, change }: Readonly<{ weapon: Weapon; change: Change }>) {
  const [near, far] = weapon.range ?? [80, 320];
  return (
    <>
      <Field label={t('item.form.range')}>
        <NumberField value={near} min={5} step={5} onValueChange={(n) => change({ range: [n, Math.max(n, far)] })} />
      </Field>
      <Field label={t('item.form.longRange')}>
        <NumberField value={far} min={near} step={5} onValueChange={(n) => change({ range: [near, n] })} />
      </Field>
    </>
  );
}

/** `onHit` with `patch`, or none when nothing is left in it. */
function withOnHit(onHit: OnHit | undefined, patch: Partial<OnHit>): OnHit | undefined {
  const entries: [string, unknown][] = Object.entries({ ...onHit, ...patch });
  const next = Object.fromEntries(entries.filter(([, v]) => v !== undefined)) as OnHit;
  return next.save || next.damage?.length || next.conditions?.length ? next : undefined;
}

/** What rides on the weapon's hit: a save against it, extra damage, conditions. */
function OnHitFields({ onHit, set }: Readonly<{ onHit?: OnHit; set: (onHit: OnHit | undefined) => void }>) {
  const patch = (p: Partial<OnHit>) => set(withOnHit(onHit, p));
  const save = onHit?.save;
  return (
    <fieldset className="col-span-2 grid grid-cols-2 gap-3 border-t border-gold-dim/40 pt-2">
      <legend className="font-display text-sm text-gold">{t('item.form.onHit')}</legend>
      <Field label={t('item.form.onHitSave')}>
        <SelectField
          value={save?.ability ?? ''}
          onValueChange={(a) => patch({ save: a ? { ability: a as 'con', dc: save?.dc ?? 13 } : undefined })}
          options={[
            { value: '', label: t('item.form.onHitNoSave') },
            ...ABILITIES.map((a) => ({ value: a, label: a.toUpperCase() })),
          ]}
        />
      </Field>
      {save && (
        <Field label={t('item.form.onHitDc')}>
          <NumberField value={save.dc} min={1} max={40} onValueChange={(dc) => patch({ save: { ...save, dc } })} />
        </Field>
      )}
      <OnHitDamage damage={onHit?.damage} set={(damage) => patch({ damage })} />
      {save && onHit.damage && (
        <Field label={t('item.form.onHitHalf')}>
          <Checkbox checked={onHit.half === true} onCheckedChange={(on) => patch({ half: on === true || undefined })} />
        </Field>
      )}
      <OnHitConditions onHit={onHit} patch={patch} />
    </fieldset>
  );
}

/** The extra damage, typed as text; kept here until it reads ("2d6 poison"). */
function OnHitDamage({ damage, set }: Readonly<{ damage?: OnHit['damage']; set: (d: OnHit['damage']) => void }>) {
  const [text, setText] = useState(damage ? damageText(damage) : '');
  const [problem, setProblem] = useState<string>();
  const type = (value: string) => {
    setText(value);
    try {
      const read = value.trim() ? typedDamage(value) : undefined;
      setProblem(undefined);
      set(read);
    } catch (e) {
      setProblem((e as Error).message);
    }
  };
  return (
    <Field label={t('item.form.onHitDamage')}>
      <Input value={text} placeholder={t('item.form.onHitDamageHint')} onChange={(e) => type(e.target.value)} />
      {problem && <span className="text-xs text-[#e2766e]">{problem}</span>}
    </Field>
  );
}

function OnHitConditions({ onHit, patch }: Readonly<{ onHit?: OnHit; patch: (p: Partial<OnHit>) => void }>) {
  const conditions = onHit?.conditions ?? [];
  const toggle = (c: (typeof conditions)[number]) => {
    const next = conditions.includes(c) ? conditions.filter((x) => x !== c) : [...conditions, c];
    patch({ conditions: next.length ? next : undefined });
  };
  return (
    <>
      <Field label={t('item.form.onHitConditions')} wide>
        <div className="flex flex-wrap gap-1.5">
          {ConditionSchema.options.map((c) => (
            <Toggle key={c} pressed={conditions.includes(c)} onPressedChange={() => toggle(c)}>
              {c}
            </Toggle>
          ))}
        </div>
      </Field>
      {conditions.length > 0 && (
        <Field label={t('item.form.onHitRounds')}>
          <NumberField
            value={onHit?.rounds ?? 0}
            min={0}
            max={1000}
            onValueChange={(n) => patch({ rounds: n || undefined })}
          />
        </Field>
      )}
      {conditions.length > 0 && onHit?.save && (
        <Field label={t('item.form.onHitRepeat')}>
          <Checkbox
            checked={onHit.repeatSave === true}
            onCheckedChange={(on) => patch({ repeatSave: on === true || undefined })}
          />
        </Field>
      )}
    </>
  );
}

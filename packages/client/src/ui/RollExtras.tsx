import { t } from '../i18n/index.ts';
import { costHint } from '../play/power-aiming.ts';
import { type Extra, type ExtraValue, withExtras } from '../play/roll-extras.ts';
import type { RollPlan } from '../play/roll-plan.ts';
import { NumberField } from './kit/number-field.tsx';
import { SelectField } from './kit/select.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

// The action's own picks in the roll dialog (roll-extras.ts): a pool
// feature's options and numbers with what they cost, a spell's summon,
// option or form, a smite or a finisher on an attack. The bars over the
// action bar ask the same when the dialog is off.

type Values = Record<string, ExtraValue>;
type Props = Readonly<{ plan: RollPlan; values: Values; change: (values: Values) => void }>;
type PickProps = Readonly<{ extra: Extra; value: ExtraValue; set: (value: ExtraValue) => void }>;

/** Stands for "none" where a control can't hold an empty value. */
const NONE = 'none';
/** More options than this are listed in a select. */
const IN_A_ROW = 4;

/** What a pool feature costs with the picks as they stand. */
function costOf(plan: RollPlan, values: Values): string {
  const msg = withExtras(plan.msg, plan.extras, values);
  if (!plan.power || msg.t !== 'feature') return '';
  return costHint(plan.power, { picks: msg.picks ?? [], inputs: msg.inputs ?? {} });
}

export function ExtraPicks({ plan, values, change }: Props) {
  const cost = costOf(plan, values);
  return (
    <>
      {plan.extras.map((extra) => (
        <section key={extra.id} className="flex flex-col gap-1.5" data-slot="roll-extra">
          <span className="font-display text-sm text-gold">{extra.label}</span>
          <ExtraPick
            extra={extra}
            value={values[extra.id] ?? extra.value}
            set={(value) => change({ ...values, [extra.id]: value })}
          />
        </section>
      ))}
      {cost && <span className="text-xs text-muted-foreground">{cost}</span>}
    </>
  );
}

function ExtraPick(props: PickProps) {
  const { extra, value, set } = props;
  if (extra.kind === 'number') {
    return (
      <NumberField
        className="w-32"
        value={Number(value)}
        min={extra.min}
        aria-label={extra.label}
        onValueChange={set}
      />
    );
  }
  return extra.kind === 'any' ? <AnyOf {...props} /> : <OneOf {...props} />;
}

/** Any of several; a group that must have one keeps its last. */
function AnyOf({ extra, value, set }: PickProps) {
  return (
    <ToggleGroup
      type="multiple"
      className="w-full flex-wrap"
      aria-label={extra.label}
      value={[value].flat().map(String)}
      onValueChange={(picked) => (picked.length || !extra.required) && set(picked)}
    >
      {extra.options?.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} title={o.hint}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** One of several, in a row when they fit, else in a list; one that may be left out has "None". */
function OneOf({ extra, value, set }: PickProps) {
  const none = { value: NONE, label: t('rolls.extra.none') };
  const options: NonNullable<Extra['options']> = [...(extra.optional ? [none] : []), ...(extra.options ?? [])];
  const shown = value === '' ? NONE : String(value);
  const pick = (v: string) => set(v === NONE ? '' : v);
  if (options.length > IN_A_ROW) {
    return <SelectField aria-label={extra.label} value={shown} onValueChange={pick} options={options} />;
  }
  return (
    <ToggleGroup
      type="single"
      className="w-full"
      aria-label={extra.label}
      value={shown}
      onValueChange={(v) => v && pick(v)}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} title={o.hint}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

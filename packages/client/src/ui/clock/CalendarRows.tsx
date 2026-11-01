import { PlusIcon, XIcon } from 'lucide-react';
import type { Calendar } from '@vtt/shared';
import { Button } from '../kit/button.tsx';
import { Input } from '../kit/input.tsx';
import { NumberField } from '../kit/number-field.tsx';

type Month = Calendar['months'][number];

const without = <T,>(list: readonly T[], at: number) => list.filter((_, i) => i !== at);
const replaced = <T,>(list: readonly T[], at: number, item: T) => list.map((x, i) => (i === at ? item : x));

function RemoveButton({
  label,
  disabled,
  onClick,
}: Readonly<{ label: string; disabled: boolean; onClick: () => void }>) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      <XIcon />
    </Button>
  );
}

function AddButton({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <Button variant="ghost" size="sm" className="self-start text-gold" onClick={onClick}>
      <PlusIcon /> {label}
    </Button>
  );
}

/** Each month's name and length; a calendar keeps at least one. */
export function MonthRows({ months, onChange }: Readonly<{ months: Month[]; onChange: (m: Month[]) => void }>) {
  return (
    <div className="flex flex-col gap-1">
      {months.map((m, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-5 text-right text-xs lining-nums tabular-nums text-muted-foreground">{i + 1}</span>
          <Input
            className="w-full"
            aria-label={`Month ${i + 1}`}
            value={m.name}
            onChange={(e) => onChange(replaced(months, i, { ...m, name: e.target.value }))}
          />
          <NumberField
            className="w-24 shrink-0"
            aria-label={`Days in month ${i + 1}`}
            value={m.days}
            min={1}
            onValueChange={(days) => onChange(replaced(months, i, { ...m, days }))}
          />
          <RemoveButton
            label="Remove month"
            disabled={months.length < 2}
            onClick={() => onChange(without(months, i))}
          />
        </div>
      ))}
      <AddButton
        label="Add a month"
        onClick={() => onChange([...months, { name: `Month ${months.length + 1}`, days: 30 }])}
      />
    </div>
  );
}

/** The days of the week, in order; a week keeps at least one. */
export function WeekdayRows({ weekdays, onChange }: Readonly<{ weekdays: string[]; onChange: (w: string[]) => void }>) {
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-1">
        {weekdays.map((w, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input
              className="w-full"
              aria-label={`Weekday ${i + 1}`}
              value={w}
              onChange={(e) => onChange(replaced(weekdays, i, e.target.value))}
            />
            <RemoveButton
              label="Remove weekday"
              disabled={weekdays.length < 2}
              onClick={() => onChange(without(weekdays, i))}
            />
          </div>
        ))}
      </div>
      <AddButton label="Add a weekday" onClick={() => onChange([...weekdays, `Day ${weekdays.length + 1}`])} />
    </div>
  );
}

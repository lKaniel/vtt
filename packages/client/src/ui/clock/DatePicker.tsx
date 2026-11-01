import { useState } from 'react';
import { type CalendarDate, dateOf, secondsOf } from '@vtt/shared';
import { monthGrid, stepMonth } from '../../calendar-view.ts';
import type { Session } from '../../session.ts';
import { Button } from '../kit/button.tsx';
import { CalendarMonth } from '../kit/calendar.tsx';
import { Label } from '../kit/label.tsx';
import { NumberField } from '../kit/number-field.tsx';

type Draft = Pick<CalendarDate, 'year' | 'month' | 'day' | 'hour' | 'minute'>;
const draftOf = ({ year, month, day, hour, minute }: CalendarDate): Draft => ({ year, month, day, hour, minute });

/** Pick a day on the month's page and a time, then set the clock to it. */
export function DatePicker({ session }: Readonly<{ session: Session }>) {
  const { calendar } = session.clock();
  const now = dateOf(calendar, session.gameTime());
  const [draft, setDraft] = useState<Draft>(() => draftOf(now));
  const [page, setPage] = useState({ year: now.year, month: now.month });
  const grid = monthGrid(calendar, page);
  const shown = (d: Draft) => d.year === page.year && d.month === page.month;
  const era = calendar.era ? ` ${calendar.era}` : '';
  return (
    <div className="flex flex-col gap-3">
      <CalendarMonth
        title={`${grid.name} ${page.year}${era}`}
        weekdays={calendar.weekdays}
        days={grid.days}
        blanks={grid.blanks}
        selected={shown(draft) ? draft.day : undefined}
        today={shown(now) ? now.day : undefined}
        onSelect={(day) => setDraft({ ...draft, ...page, day })}
        onPage={(by) => setPage(stepMonth(calendar, page, by))}
        yearStep={calendar.months.length}
      />
      <div className="flex items-end gap-2">
        <Label className="flex-col items-start gap-1">
          Hour
          <NumberField
            className="w-24"
            aria-label="Hour"
            value={draft.hour}
            min={0}
            max={23}
            pad={2}
            onValueChange={(hour) => setDraft({ ...draft, hour })}
          />
        </Label>
        <span className="pb-1.5 text-lg text-muted-foreground">:</span>
        <Label className="flex-col items-start gap-1">
          Minute
          <NumberField
            className="w-24"
            aria-label="Minute"
            value={draft.minute}
            min={0}
            max={59}
            pad={2}
            onValueChange={(minute) => setDraft({ ...draft, minute })}
          />
        </Label>
        <Button
          className="ml-auto"
          onClick={() => session.clockAction({ do: 'set', time: secondsOf(calendar, draft) })}
        >
          Set date &amp; time
        </Button>
      </div>
    </div>
  );
}

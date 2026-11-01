import { type ReactNode, useState } from 'react';
import type { Calendar } from '@vtt/shared';
import type { Session } from '../../session.ts';
import { Button } from '../kit/button.tsx';
import { Card } from '../kit/card.tsx';
import { Input } from '../kit/input.tsx';
import { Label } from '../kit/label.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { Slider } from '../kit/slider.tsx';
import { MonthRows, WeekdayRows } from './CalendarRows.tsx';

/** The GM's calendar: its name and era, its months and weekdays, when the sun rises and sets, how dark night is. */
export function CalendarEditor({ session }: Readonly<{ session: Session }>) {
  const saved = session.clock().calendar;
  const [draft, setDraft] = useState<Calendar>(saved);
  const set = (change: Partial<Calendar>) => setDraft({ ...draft, ...change });
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_7rem_5rem] gap-2">
        <Label className="flex-col items-start gap-1">
          Name
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
        </Label>
        <Label className="flex-col items-start gap-1">
          First year
          <NumberField value={draft.epochYear} onValueChange={(epochYear) => set({ epochYear })} />
        </Label>
        <Label className="flex-col items-start gap-1">
          Era
          <Input value={draft.era ?? ''} placeholder="DR" onChange={(e) => set({ era: e.target.value })} />
        </Label>
      </div>
      <Section title="Months" note={`${draft.months.reduce((n, m) => n + m.days, 0)} days a year`}>
        <MonthRows months={draft.months} onChange={(months) => set({ months })} />
      </Section>
      <Section title="Weekdays" note={`${draft.weekdays.length} days a week`}>
        <WeekdayRows weekdays={draft.weekdays} onChange={(weekdays) => set({ weekdays })} />
      </Section>
      <SunFields draft={draft} set={set} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={!changed} onClick={() => setDraft(saved)}>
          Undo changes
        </Button>
        <Button disabled={!changed} onClick={() => session.clockAction({ do: 'calendar', calendar: draft })}>
          Save calendar
        </Button>
      </div>
    </div>
  );
}

function Section({ title, note, children }: Readonly<{ title: string; note: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-sm tracking-wider text-gold-bright">{title}</span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      <Card className="max-h-44 overflow-y-auto p-1.5">{children}</Card>
    </div>
  );
}

const hhmm = (h: number) =>
  `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Sunrise and sunset on one 24-hour track, the twilight around them, and night's darkness. */
function SunFields({ draft, set }: Readonly<{ draft: Calendar; set: (c: Partial<Calendar>) => void }>) {
  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs">
          <Label>Daylight</Label>
          <span className="tabular-nums text-foreground/85">
            Sunrise {hhmm(draft.sunrise)} · Sunset {hhmm(draft.sunset)}
          </span>
        </div>
        <Slider
          aria-label="Sunrise and sunset"
          min={0}
          max={24}
          step={0.25}
          minStepsBetweenThumbs={1}
          value={[draft.sunrise, draft.sunset]}
          onValueChange={([sunrise, sunset]) => set({ sunrise, sunset })}
        />
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3">
        <Label>Twilight</Label>
        <div className="flex items-center gap-2">
          <NumberField
            className="w-28"
            aria-label="Twilight hours"
            value={draft.twilight}
            min={0}
            max={12}
            step={0.5}
            onValueChange={(twilight) => set({ twilight })}
          />
          <span className="text-xs text-muted-foreground">hours of dawn and dusk</span>
        </div>
        <Label>Night</Label>
        <div className="flex items-center gap-3">
          <Slider
            aria-label="Darkness at night"
            min={0}
            max={1}
            step={0.05}
            value={[draft.night]}
            onValueChange={([night]) => set({ night })}
          />
          <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(draft.night * 100)}% dark
          </span>
        </div>
      </div>
    </Card>
  );
}

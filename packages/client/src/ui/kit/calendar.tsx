import { ChevronLeftIcon, ChevronRightIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button.tsx';

interface CalendarMonthProps extends Omit<React.ComponentProps<'div'>, 'onSelect' | 'title'> {
  /** "Hammer 1492 DR": the month shown, above the grid. */
  title: React.ReactNode;
  /** Column headings: any number of weekdays (fantasy weeks run 5 or 10 days). */
  weekdays: readonly string[];
  days: number;
  /** Empty cells before day 1. */
  blanks: number;
  /** The day picked, in this month. */
  selected?: number;
  /** The day it is now, in this month. */
  today?: number;
  onSelect: (day: number) => void;
  /** Page `by` months (negative: back). */
  onPage: (by: number) => void;
  /** Months in a year: adds year buttons that page this many months. */
  yearStep?: number;
}

/**
 * One month of any calendar as a page of weeks, with paging. Unlike
 * shadcn's Calendar (react-day-picker, Gregorian only) it takes the month's
 * shape from the caller, so homebrew calendars work.
 */
function CalendarMonth({
  title,
  weekdays,
  days,
  blanks,
  selected,
  today,
  onSelect,
  onPage,
  yearStep,
  className,
  ...props
}: Readonly<CalendarMonthProps>) {
  return (
    <div data-slot="calendar" className={cn('flex flex-col gap-2', className)} {...props}>
      <div className="flex items-center gap-0.5">
        {yearStep && <PageButton label="Previous year" by={-yearStep} onPage={onPage} icon={<ChevronsLeftIcon />} />}
        <PageButton label="Previous month" by={-1} onPage={onPage} icon={<ChevronLeftIcon />} />
        <div className="flex-1 text-center font-display text-sm tracking-wider text-gold-bright">{title}</div>
        <PageButton label="Next month" by={1} onPage={onPage} icon={<ChevronRightIcon />} />
        {yearStep && <PageButton label="Next year" by={yearStep} onPage={onPage} icon={<ChevronsRightIcon />} />}
      </div>
      <div
        role="grid"
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${weekdays.length}, minmax(0, 1fr))` }}
      >
        {weekdays.map((w) => (
          <div
            key={w}
            role="columnheader"
            title={w}
            className="pb-1 text-center font-display text-[10px] tracking-wider text-muted-foreground uppercase"
          >
            {w.slice(0, 2)}
          </div>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <div key={`blank-${i}`} aria-hidden />
        ))}
        {Array.from({ length: days }, (_, i) => (
          <Day key={i + 1} day={i + 1} selected={selected === i + 1} today={today === i + 1} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function PageButton({
  label,
  by,
  onPage,
  icon,
}: Readonly<{ label: string; by: number; onPage: (by: number) => void; icon: React.ReactNode }>) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={() => onPage(by)}>
      {icon}
    </Button>
  );
}

function Day({
  day,
  selected,
  today,
  onSelect,
}: Readonly<{ day: number; selected: boolean; today: boolean; onSelect: (day: number) => void }>) {
  return (
    <button
      type="button"
      role="gridcell"
      data-slot="calendar-day"
      aria-selected={selected}
      aria-current={today ? 'date' : undefined}
      onClick={() => onSelect(day)}
      className={cn(
        'relative mx-auto flex size-9 cursor-pointer items-center justify-center rounded-md text-sm lining-nums tabular-nums text-foreground/85 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        today && 'art-slot text-gold-bright',
        selected && 'art-slot-lit font-semibold text-[#fff3d6] [text-shadow:0_1px_3px_#000] hover:bg-transparent',
      )}
    >
      {day}
    </button>
  );
}

export { CalendarMonth };

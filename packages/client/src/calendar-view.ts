import { type Calendar, dateOf, secondsOf } from '@vtt/shared';

// What the GM's calendar page shows: a month laid out under its weekdays,
// paging through months, and the part of the day for the sky dial.

export interface MonthRef {
  year: number;
  /** Index into the calendar's months. */
  month: number;
}

export interface MonthGrid {
  name: string;
  days: number;
  /** Empty cells before day 1: the weekday it falls on. */
  blanks: number;
  /** One column per weekday. */
  columns: number;
}

/** A month of the calendar as a page of weeks. */
export function monthGrid(calendar: Calendar, { year, month }: MonthRef): MonthGrid {
  const m = calendar.months[month]!;
  const first = dateOf(calendar, secondsOf(calendar, { year, month, day: 1 }));
  return { name: m.name, days: m.days, blanks: first.weekday, columns: calendar.weekdays.length };
}

/** The month `by` months after `from` (before, when negative), across years. */
export function stepMonth(calendar: Calendar, from: MonthRef, by: number): MonthRef {
  const count = calendar.months.length;
  const index = from.year * count + from.month + by;
  return { year: Math.floor(index / count), month: ((index % count) + count) % count };
}

export type DayPart = 'night' | 'dawn' | 'day' | 'dusk';

/** Night, dawn, day or dusk at `hour` (0-24), by the calendar's sun. */
export function dayPart(calendar: Calendar, hour: number): DayPart {
  const half = calendar.twilight / 2;
  if (Math.abs(hour - calendar.sunrise) < half) return 'dawn';
  if (Math.abs(hour - calendar.sunset) < half) return 'dusk';
  return hour > calendar.sunrise && hour < calendar.sunset ? 'day' : 'night';
}

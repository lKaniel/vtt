import { CalendarSchema } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { dayPart, monthGrid, stepMonth } from './calendar-view.ts';

const gregorian = CalendarSchema.parse({});
const harptos = CalendarSchema.parse({
  months: [
    { name: 'Hammer', days: 30 },
    { name: 'Alturiak', days: 30 },
  ],
  weekdays: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'],
  epochYear: 1492,
});

describe('the month on the calendar page', () => {
  it('starts each month under the weekday its first day falls on', () => {
    // Time 0 is a Monday: January starts in the first column, February 31 days later on a Thursday.
    expect(monthGrid(gregorian, { year: 1, month: 0 })).toMatchObject({ blanks: 0, days: 31, name: 'January' });
    expect(monthGrid(gregorian, { year: 1, month: 1 })).toMatchObject({ blanks: 3, days: 28 });
    expect(monthGrid(harptos, { year: 1492, month: 1 })).toMatchObject({ blanks: 0, days: 30, columns: 10 });
  });

  it('steps through months into the next and last year', () => {
    expect(stepMonth(gregorian, { year: 3, month: 11 }, 1)).toEqual({ year: 4, month: 0 });
    expect(stepMonth(gregorian, { year: 3, month: 0 }, -1)).toEqual({ year: 2, month: 11 });
    expect(stepMonth(harptos, { year: 1492, month: 0 }, 5)).toEqual({ year: 1494, month: 1 });
  });
});

describe('the part of the day', () => {
  it('follows the calendar’s sunrise, sunset and twilight', () => {
    expect(dayPart(gregorian, 3)).toBe('night');
    expect(dayPart(gregorian, 5.75)).toBe('dawn');
    expect(dayPart(gregorian, 12)).toBe('day');
    expect(dayPart(gregorian, 18.25)).toBe('dusk');
    expect(dayPart(gregorian, 22)).toBe('night');
  });
});

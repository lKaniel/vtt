import { ClockSchema, dateOf } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { foundryClock } from './foundry-time.ts';

// A world's time: Foundry's clock (core.time), named by Simple Calendar, with
// dawn and dusk from SmallTime, which darkens the scenes it is linked to.

const harptos = {
  id: 'default',
  currentDate: { year: 1495, month: 2, day: 4, seconds: 36000 },
  months: [
    { name: 'Hammer', numberOfDays: 30 },
    { name: 'Midwinter', numberOfDays: 1 },
    { name: 'Alturiak', numberOfDays: 30 },
    { name: 'Shieldmeet', numberOfDays: 0, numberOfLeapYearDays: 1 },
  ],
  weekdays: [{ name: '1st' }, { name: '2nd' }, { name: '3rd' }],
  year: { numericRepresentation: 1495, postfix: ' DR' },
  leapYear: { rule: 'custom', customMod: 4 },
  seasons: [{ name: 'Spring', sunriseTime: 5 * 3600, sunsetTime: 19 * 3600 }],
};

const settingsOf =
  (values: Record<string, unknown>) =>
  (key: string): unknown =>
    values[key];

describe('a Foundry world’s clock', () => {
  it('names the days with Simple Calendar’s calendar and starts on its date', () => {
    const clock = foundryClock(
      settingsOf({
        'foundryvtt-simple-calendar.active-calendar': 'default',
        'foundryvtt-simple-calendar.calendar-configuration': [harptos],
      }),
    )!;
    expect(ClockSchema.parse(clock)).toEqual(clock);
    expect(clock.calendar).toMatchObject({
      months: [
        { name: 'Hammer', days: 30 },
        { name: 'Midwinter', days: 1 },
        { name: 'Alturiak', days: 30 },
      ],
      weekdays: ['1st', '2nd', '3rd'],
      epochYear: 1495,
      era: 'DR',
      sunrise: 5,
      sunset: 19,
    });
    expect(dateOf(clock.calendar, clock.time)).toMatchObject({ year: 1495, month: 2, day: 5, hour: 10, minute: 0 });
  });

  it('reads the date from Foundry’s clock, which Simple Calendar keeps in step, counting its leap years', () => {
    // Year 0 is a leap year (62 days), year 1 is not (61): Alturiak 1st of year 2, 10:00.
    const clock = foundryClock(
      settingsOf({
        'core.time': (62 + 61 + 31) * 86400 + 36000,
        'foundryvtt-simple-calendar.calendar-configuration': [harptos],
      }),
    )!;
    expect(clock.calendar.epochYear).toBe(2);
    expect(dateOf(clock.calendar, clock.time)).toMatchObject({ year: 2, month: 2, day: 1, hour: 10 });
  });

  it('takes dawn and dusk from SmallTime, which is what darkens the scenes', () => {
    const clock = foundryClock(
      settingsOf({
        'core.time': 3600,
        'smalltime.sunrise-start': 240,
        'smalltime.sunrise-end': 480,
        'smalltime.sunset-start': 960,
        'smalltime.sunset-end': 1200,
      }),
    )!;
    expect(clock.time).toBe(3600);
    expect(clock.calendar).toMatchObject({ sunrise: 6, sunset: 18, twilight: 4 });
  });

  it('is left to the game when the world never kept time', () => {
    expect(foundryClock(settingsOf({}))).toBeUndefined();
  });
});

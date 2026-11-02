import { describe, expect, it } from 'vitest';
import { CalendarSchema, DAY, HOUR } from './clock.ts';
import { WeatherCycleSchema, weatherAt, weatherPeriod } from './weather-cycle.ts';

const calendar = CalendarSchema.parse({});
const cycle = (data: object) => WeatherCycleSchema.parse(data);

describe('weather that changes with world time', () => {
  it('holds one weather for each stretch of `every` hours', () => {
    const c = cycle({ every: 6, options: [{ weather: 'rain' }, { weather: 'clear' }, { weather: 'fog' }] });
    expect(weatherPeriod(c, 0)).toBe(0);
    expect(weatherPeriod(c, 6 * HOUR - 1)).toBe(0);
    expect(weatherPeriod(c, 6 * HOUR)).toBe(1);
    const at = (t: number) => weatherAt(c, calendar, t, 'forest');
    expect(at(HOUR)).toEqual(at(5 * HOUR));
  });

  it('turns a preset into its layers, and "clear" into none', () => {
    const rain = cycle({ options: [{ weather: 'rain' }] });
    expect(weatherAt(rain, calendar, 0, 's')).toEqual([{ kind: 'rain', density: 0.5 }]);
    const clear = cycle({ options: [{ weather: 'clear' }] });
    expect(weatherAt(clear, calendar, 0, 's')).toEqual([]);
  });

  it('is the same weather every time for the same scene and time, and varies over the days', () => {
    const c = cycle({ every: 4, options: [{ weather: 'rain' }, { weather: 'clear' }, { weather: 'snow' }] });
    const seen = new Set<string>();
    for (let t = 0; t < 30 * DAY; t += 4 * HOUR) {
      const w = weatherAt(c, calendar, t, 'moor');
      expect(weatherAt(c, calendar, t, 'moor')).toEqual(w);
      seen.add(JSON.stringify(w));
    }
    expect(seen.size).toBe(3);
  });

  it('weighs the options: a weight of 0 never comes up', () => {
    const c = cycle({ options: [{ weather: 'rain', weight: 0 }, { weather: 'clear' }] });
    for (let t = 0; t < 10 * DAY; t += 4 * HOUR) expect(weatherAt(c, calendar, t, 'x')).toEqual([]);
  });

  it('keeps an option to the months it names: snow only in winter', () => {
    const c = cycle({
      options: [
        { weather: 'snow', months: [0, 1, 11] },
        { weather: 'clear', months: [5, 6, 7] },
      ],
    });
    expect(weatherAt(c, calendar, 10 * DAY, 'x')).toEqual([{ kind: 'snow', density: 0.5 }]);
    expect(weatherAt(c, calendar, 190 * DAY, 'x')).toEqual([]);
    // A month no option names: clear skies.
    expect(weatherAt(c, calendar, 100 * DAY, 'x')).toEqual([]);
  });
});

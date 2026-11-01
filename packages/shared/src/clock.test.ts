import { describe, expect, it } from 'vitest';
import {
  CalendarSchema,
  ClockSchema,
  clockAfterFight,
  clockInFight,
  darknessAt,
  dateOf,
  DAY,
  formatDate,
  formatDuration,
  HOUR,
  MINUTE,
  ROUND_SECONDS,
  secondsOf,
  skipClock,
  startClock,
  stopClock,
  timeNow,
} from './clock.ts';

const calendar = CalendarSchema.parse({
  months: [
    { name: 'Frost', days: 30 },
    { name: 'Thaw', days: 31 },
  ],
  weekdays: ['Moonday', 'Fireday', 'Restday'],
  epochYear: 1000,
  era: 'AR',
});
const clock = ClockSchema.parse({ calendar });

describe('calendar dates', () => {
  it('count a year as all its months', () => {
    expect(dateOf(calendar, 0)).toMatchObject({ year: 1000, month: 0, day: 1, hour: 0, minute: 0, weekday: 0 });
    expect(dateOf(calendar, 30 * DAY + 13 * HOUR + 5 * MINUTE + 9)).toMatchObject({
      year: 1000,
      month: 1,
      day: 1,
      hour: 13,
      minute: 5,
      second: 9,
      weekday: 0,
    });
    expect(dateOf(calendar, 61 * DAY)).toMatchObject({ year: 1001, month: 0, day: 1, weekday: 1 });
  });

  it('turn a date back into seconds', () => {
    const t = 61 * DAY + 40 * DAY + 7 * HOUR + 30 * MINUTE;
    expect(secondsOf(calendar, dateOf(calendar, t))).toBe(t);
    expect(secondsOf(calendar, { year: 1001, month: 1, day: 11, hour: 7, minute: 30 })).toBe(t);
  });

  it('write a date with the weekday, month and era', () => {
    expect(formatDate(calendar, 30 * DAY + 13 * HOUR + 5 * MINUTE)).toBe('Moonday, 1 Thaw 1000 AR, 13:05');
  });

  it('come with a default calendar of twelve months and seven weekdays', () => {
    const plain = CalendarSchema.parse({});
    expect(plain.months).toHaveLength(12);
    expect(plain.weekdays).toHaveLength(7);
    expect(plain.months.reduce((n, m) => n + m.days, 0)).toBe(365);
  });

  it('say how long something lasts in the largest units', () => {
    expect(formatDuration(6)).toBe('6 s');
    expect(formatDuration(90)).toBe('1 min 30 s');
    expect(formatDuration(8 * HOUR)).toBe('8 h');
    expect(formatDuration(DAY + HOUR)).toBe('1 day 1 h');
  });
});

describe('time of day', () => {
  it('is light by day, dark by night and fades between at dawn and dusk', () => {
    expect(darknessAt(calendar, 12 * HOUR)).toBe(0);
    expect(darknessAt(calendar, 0)).toBe(1);
    expect(darknessAt(calendar, 6 * HOUR)).toBeCloseTo(0.5);
    expect(darknessAt(calendar, 18 * HOUR)).toBeCloseTo(0.5);
    expect(darknessAt(calendar, 5.75 * HOUR)).toBeCloseTo(0.75);
    expect(darknessAt(calendar, DAY + 12 * HOUR)).toBe(0);
  });

  it('can stop at a lighter night', () => {
    expect(darknessAt({ ...calendar, night: 0.8 }, 0)).toBeCloseTo(0.8);
  });
});

describe('the game clock', () => {
  it('stands still until started, then runs at its speed', () => {
    expect(timeNow(clock, 50_000)).toBe(0);
    const running = startClock(clock, 10_000);
    expect(timeNow(running, 13_000)).toBe(3);
    expect(timeNow({ ...running, speed: 10 }, 13_000)).toBe(30);
  });

  it('keeps the time it reached when stopped', () => {
    const running = startClock({ ...clock, time: 100 }, 0);
    const stopped = stopClock(running, 4_000);
    expect(stopped).toMatchObject({ time: 104, running: false });
    expect(stopped.since).toBeUndefined();
    expect(timeNow(stopped, 99_000)).toBe(104);
  });

  it('skips ahead, running or not', () => {
    expect(skipClock(clock, HOUR, 0).time).toBe(HOUR);
    const running = startClock(clock, 0);
    const skipped = skipClock(running, MINUTE, 2_000);
    expect(timeNow(skipped, 2_000)).toBe(MINUTE + 2);
    expect(skipped.running).toBe(true);
  });

  it('holds still in a fight and moves 6 seconds a round', () => {
    expect(ROUND_SECONDS).toBe(6);
    const running = startClock({ ...clock, time: 100 }, 0);
    const fight = clockInFight(running, 1, 5_000);
    expect(fight).toMatchObject({ time: 105, round: 1 });
    expect(fight.since).toBeUndefined();
    expect(timeNow(fight, 60_000)).toBe(105);
    const third = clockInFight(fight, 3, 70_000);
    expect(third).toMatchObject({ time: 117, round: 3 });
    // The same round again changes nothing.
    expect(clockInFight(third, 3, 80_000)).toBe(third);
  });

  it('finishes the last round when the fight ends, and runs on if it was running', () => {
    const fight = clockInFight(startClock(clock, 0), 1, 0);
    const after = clockAfterFight(clockInFight(fight, 2, 0), 9_000);
    expect(after).toMatchObject({ time: 12, running: true, since: 9_000 });
    expect(after.round).toBeUndefined();
    const stopped = clockAfterFight(clockInFight(clock, 1, 0), 9_000);
    expect(stopped).toMatchObject({ time: 6 });
    expect(stopped.since).toBeUndefined();
    // No fight on: nothing to finish.
    expect(clockAfterFight(clock, 0)).toBe(clock);
  });
});

import { z } from 'zod';

// World time (time.json): the game clock in seconds and the calendar that
// names its days. The clock stands still, runs (at `speed` game seconds per
// real second) or, in a fight or in turn-based mode, moves 6 seconds a
// round. Darkness on scenes that follow the clock, and everything that lasts
// a while (effects, concentration, summons, templates), read the time here.

export const MINUTE = 60;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** A round of turns, in a fight or in turn-based mode. */
export const ROUND_SECONDS = 6;

const name = z.string().min(1);

const GREGORIAN: { name: string; days: number }[] = [
  ['January', 31],
  ['February', 28],
  ['March', 31],
  ['April', 30],
  ['May', 31],
  ['June', 30],
  ['July', 31],
  ['August', 31],
  ['September', 30],
  ['October', 31],
  ['November', 30],
  ['December', 31],
].map(([n, d]) => ({ name: n as string, days: d as number }));

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** How the game names its days: months, weekdays, the first year, and when the sun rises and sets. */
export const CalendarSchema = z.object({
  name: z.string().default('Calendar'),
  months: z
    .array(z.object({ name, days: z.number().int().positive() }))
    .min(1)
    .default(GREGORIAN),
  weekdays: z.array(name).min(1).default(WEEK),
  /** The year time 0 falls in. */
  epochYear: z.number().int().default(1),
  /** Written after the year, e.g. "AR". */
  era: z.string().optional(),
  /** Hours (0-24) the sun rises and sets; dawn and dusk last `twilight` hours around them. */
  sunrise: z.number().min(0).max(24).default(6),
  sunset: z.number().min(0).max(24).default(18),
  twilight: z.number().min(0).max(12).default(1),
  /** Darkness at night on scenes that follow the clock (0 daylight, 1 pitch black). */
  night: z.number().min(0).max(1).default(1),
});
export type Calendar = z.infer<typeof CalendarSchema>;

/** time.json */
export const ClockSchema = z.object({
  /** Game seconds since the start of the calendar's first year (when `since` is set: at that moment). */
  time: z.number().default(0),
  /** The GM has the clock running (it still holds still in a fight). */
  running: z.boolean().optional(),
  /** Game seconds per real second while running. */
  speed: z.number().positive().default(1),
  /** Server time (ms) the clock has been running from; missing while it stands still. */
  since: z.number().optional(),
  /** The fight round the clock last counted, while a fight is on. */
  round: z.number().int().positive().optional(),
  calendar: CalendarSchema.default(() => CalendarSchema.parse({})),
});
export type Clock = z.infer<typeof ClockSchema>;

/** The collection and id time.json is kept under. */
export const CLOCK_COLL = 'time';
export const CLOCK_ID = 'clock';

export interface CalendarDate {
  year: number;
  /** Index into the calendar's months. */
  month: number;
  /** 1 for the first day of the month. */
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Index into the calendar's weekdays. */
  weekday: number;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;
const yearDays = (c: Calendar) => c.months.reduce((n, m) => n + m.days, 0);

/** The date and time `time` seconds into the calendar. */
export function dateOf(calendar: Calendar, time: number): CalendarDate {
  const t = Math.floor(time);
  const days = Math.floor(t / DAY);
  const inDay = mod(t, DAY);
  const perYear = yearDays(calendar);
  let left = mod(days, perYear);
  let month = 0;
  while (left >= calendar.months[month]!.days) left -= calendar.months[month++]!.days;
  return {
    year: calendar.epochYear + Math.floor(days / perYear),
    month,
    day: left + 1,
    hour: Math.floor(inDay / HOUR),
    minute: Math.floor(mod(inDay, HOUR) / MINUTE),
    second: mod(inDay, MINUTE),
    weekday: mod(days, calendar.weekdays.length),
  };
}

/** Seconds into the calendar of a date (the weekday is worked out, not read). */
export function secondsOf(
  calendar: Calendar,
  date: Pick<CalendarDate, 'year' | 'month' | 'day'> & Partial<Pick<CalendarDate, 'hour' | 'minute' | 'second'>>,
): number {
  const before = calendar.months.slice(0, date.month).reduce((n, m) => n + m.days, 0);
  const days = (date.year - calendar.epochYear) * yearDays(calendar) + before + date.day - 1;
  return days * DAY + (date.hour ?? 0) * HOUR + (date.minute ?? 0) * MINUTE + (date.second ?? 0);
}

const two = (n: number) => String(n).padStart(2, '0');

/** "Monday, 3 March 1492 DR, 14:05" */
export function formatDate(calendar: Calendar, time: number): string {
  const d = dateOf(calendar, time);
  const year = calendar.era ? `${d.year} ${calendar.era}` : String(d.year);
  const month = calendar.months[d.month]!.name;
  return `${calendar.weekdays[d.weekday]}, ${d.day} ${month} ${year}, ${two(d.hour)}:${two(d.minute)}`;
}

const UNITS: [number, string][] = [
  [DAY, ' day'],
  [HOUR, ' h'],
  [MINUTE, ' min'],
  [1, ' s'],
];

/** "1 h 30 min": the two largest units of a span of seconds. */
export function formatDuration(seconds: number): string {
  let left = Math.max(0, Math.round(seconds));
  const parts: string[] = [];
  for (const [size, unit] of UNITS) {
    const n = Math.floor(left / size);
    left -= n * size;
    if (n) parts.push(`${n}${unit}${unit === ' day' && n > 1 ? 's' : ''}`);
  }
  return parts.slice(0, 2).join(' ') || '0 s';
}

/** How dark the open sky is at `time`: `night` between dusk and dawn, 0 by day, fading over twilight. */
export function darknessAt(calendar: Calendar, time: number): number {
  const hour = mod(time, DAY) / HOUR;
  const { sunrise, sunset, twilight, night } = calendar;
  const half = twilight / 2;
  const fade = (edge: number, rising: boolean) => {
    const into = (hour - (edge - half)) / (twilight || 1);
    return rising ? 1 - into : into;
  };
  let dark: number;
  if (hour >= sunrise + half && hour <= sunset - half) dark = 0;
  else if (Math.abs(hour - sunrise) < half) dark = fade(sunrise, true);
  else if (Math.abs(hour - sunset) < half) dark = fade(sunset, false);
  else dark = 1;
  // In hundredths, so a running clock relights a scene now and then, not every second.
  return Math.round(dark * night * 100) / 100;
}

/** The game time now, `at` being the server's time in ms. */
export function timeNow(clock: Clock, at: number): number {
  if (clock.since === undefined) return clock.time;
  return clock.time + ((at - clock.since) / 1000) * clock.speed;
}

/** Sets the clock running from now. */
export function startClock(clock: Clock, at: number): Clock {
  const time = timeNow(clock, at);
  return { ...clock, time, running: true, ...(clock.round === undefined ? { since: at } : {}) };
}

/** Stops the clock where it is. */
export function stopClock(clock: Clock, at: number): Clock {
  const { since: _since, ...rest } = clock;
  return { ...rest, time: timeNow(clock, at), running: false };
}

/** Moves the clock on by `seconds`. */
export function skipClock(clock: Clock, seconds: number, at: number): Clock {
  return { ...clock, time: timeNow(clock, at) + seconds, ...(clock.since === undefined ? {} : { since: at }) };
}

/** The clock in a fight in round `round`: it holds still, and each round that went by adds 6 seconds. */
export function clockInFight(clock: Clock, round: number, at: number): Clock {
  if (clock.round === round) return clock;
  const { since: _since, ...rest } = clock;
  const passed = clock.round === undefined ? 0 : (round - clock.round) * ROUND_SECONDS;
  return { ...rest, time: timeNow(clock, at) + passed, round };
}

/** The clock once a fight is over: the last round's 6 seconds go by, and a running clock runs on. */
export function clockAfterFight(clock: Clock, at: number): Clock {
  if (clock.round === undefined) return clock;
  const { round: _round, ...rest } = clock;
  return { ...rest, time: clock.time + ROUND_SECONDS, ...(clock.running ? { since: at } : {}) };
}

/** What the GM does with the clock (the `clock` message). */
export const ClockActionSchema = z.discriminatedUnion('do', [
  z.object({ do: z.literal('start') }),
  z.object({ do: z.literal('stop') }),
  /** Lets time pass: minutes, hours, days. */
  z.object({ do: z.literal('skip'), seconds: z.number().positive().max(1e10) }),
  /** Sets the date and time (seconds into the calendar). */
  z.object({ do: z.literal('set'), time: z.number().min(-1e12).max(1e12) }),
  z.object({ do: z.literal('speed'), speed: z.number().positive().max(10_000) }),
  /** Changes the calendar; fields left out stay as they are. */
  z.object({ do: z.literal('calendar'), calendar: CalendarSchema.partial() }),
]);
export type ClockAction = z.infer<typeof ClockActionSchema>;

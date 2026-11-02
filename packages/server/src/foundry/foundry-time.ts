import { type Calendar, CalendarSchema, type Clock, DAY, HOUR } from '@vtt/shared';
import { z } from 'zod';

// A Foundry world's time as our game clock (time.json). Foundry counts game
// seconds in `core.time`; Simple Calendar names the days (its months,
// weekdays and leap years) and SmallTime darkens linked scenes between
// its dawn and dusk. Without them the clock starts where Foundry's stood.

type Setting = (key: string) => unknown;

const num = z.number().optional().catch(undefined);
const str = z.string().optional().catch(undefined);

const SimpleCalendar = z.object({
  id: str,
  currentDate: z.object({ year: z.number(), month: z.number(), day: z.number(), seconds: num }),
  months: z.array(z.object({ name: z.string(), numberOfDays: z.number(), numberOfLeapYearDays: num })).min(1),
  weekdays: z.array(z.object({ name: z.string() })).catch([]),
  year: z.object({ postfix: str, prefix: str, yearZero: num }).optional().catch(undefined),
  leapYear: z.object({ rule: str, customMod: num }).optional().catch(undefined),
  seasons: z.array(z.object({ sunriseTime: num, sunsetTime: num })).catch([]),
});
type SimpleCalendarData = z.infer<typeof SimpleCalendar>;

/** The calendar Simple Calendar has active, if it is set up. */
function simpleCalendar(setting: Setting): SimpleCalendarData | undefined {
  const all = setting('foundryvtt-simple-calendar.calendar-configuration');
  if (!Array.isArray(all)) return undefined;
  const active = setting('foundryvtt-simple-calendar.active-calendar');
  const chosen = (all as unknown[]).find((c) => (c as { id?: unknown }).id === active) ?? (all as unknown[])[0];
  return SimpleCalendar.safeParse(chosen).data;
}

/** Its months (a leap day of none is left out), weekdays, year and season's sunrise and sunset. */
function calendarOf(sc: SimpleCalendarData, year: number): Partial<Calendar> {
  const months = sc.months.filter((m) => m.numberOfDays > 0).map((m) => ({ name: m.name, days: m.numberOfDays }));
  const era = (sc.year?.postfix ?? sc.year?.prefix)?.trim();
  const season = sc.seasons[0];
  return {
    months,
    ...(sc.weekdays.length ? { weekdays: sc.weekdays.map((w) => w.name) } : {}),
    epochYear: year,
    ...(era ? { era } : {}),
    ...(season?.sunriseTime !== undefined ? { sunrise: season.sunriseTime / HOUR } : {}),
    ...(season?.sunsetTime !== undefined ? { sunset: season.sunsetTime / HOUR } : {}),
  };
}

/** Whether Simple Calendar makes `year` a leap year. */
function isLeap(sc: SimpleCalendarData, year: number): boolean {
  const rule = sc.leapYear?.rule;
  if (rule === 'gregorian') return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const every = sc.leapYear?.customMod ?? 0;
  return rule === 'custom' && every > 0 && year % every === 0;
}

const yearDays = (sc: SimpleCalendarData, year: number) =>
  sc.months.reduce((n, m) => n + (isLeap(sc, year) ? (m.numberOfLeapYearDays ?? m.numberOfDays) : m.numberOfDays), 0);

/** Today as a year and the seconds into it: from Foundry's clock (Simple Calendar keeps it in step), else its saved date. */
function today(sc: SimpleCalendarData, seconds: number | undefined): { year: number; time: number } {
  if (seconds === undefined || seconds < 0) {
    const { year, month, day, seconds: s } = sc.currentDate;
    const before = sc.months.slice(0, month).reduce((n, m) => n + m.numberOfDays, 0);
    return { year, time: (before + day) * DAY + (s ?? 0) };
  }
  let [year, days] = [sc.year?.yearZero ?? 0, Math.floor(seconds / DAY)];
  while (days >= yearDays(sc, year) && yearDays(sc, year) > 0) days -= yearDays(sc, year++);
  return { year, time: days * DAY + (seconds % DAY) };
}

/** SmallTime's dawn and dusk (minutes into the day): the middle of each, and how long they last. */
function smallTime(setting: Setting): Partial<Calendar> {
  const [riseFrom, riseTo, setFrom, setTo] = ['sunrise-start', 'sunrise-end', 'sunset-start', 'sunset-end'].map((k) =>
    num.parse(setting(`smalltime.${k}`)),
  );
  if ([riseFrom, riseTo, setFrom, setTo].some((m) => m === undefined)) return {};
  const hours = (m: number) => Math.round((m / 60) * 100) / 100;
  return {
    sunrise: hours((riseFrom! + riseTo!) / 2),
    sunset: hours((setFrom! + setTo!) / 2),
    twilight: Math.min(12, hours(Math.max(riseTo! - riseFrom!, setTo! - setFrom!))),
  };
}

/** time.json for the world, or undefined when it never kept time. */
export function foundryClock(setting: Setting): Clock | undefined {
  const sc = simpleCalendar(setting);
  const seconds = num.parse(setting('core.time'));
  if (!sc && seconds === undefined) return undefined;
  if (!sc) return { time: Math.max(0, seconds!), speed: 1, calendar: CalendarSchema.parse(smallTime(setting)) };
  const { year, time } = today(sc, seconds);
  return { time, speed: 1, calendar: CalendarSchema.parse({ ...calendarOf(sc, year), ...smallTime(setting) }) };
}

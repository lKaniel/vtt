import { type Calendar, DAY, dateOf, formatDuration, HOUR, MINUTE } from '@vtt/shared';
import type { Combat, Effect } from '@vtt/system-dnd5e';

// World time in the client: what the clock bar offers, and how long an
// effect has left (rounds in a fight, game time out of one).

/** The GM's quick skips. */
export const quickSkips: { label: string; seconds: number }[] = [
  { label: '+1 min', seconds: MINUTE },
  { label: '+10 min', seconds: 10 * MINUTE },
  { label: '+1 h', seconds: HOUR },
  { label: '+8 h', seconds: 8 * HOUR },
  { label: '+1 day', seconds: DAY },
];

/** "free": the clock runs (or stands) by itself; "fight": a fight is on; "turns": turn-based mode outside one. */
export function turnMode(combat: Combat | null | undefined): 'free' | 'fight' | 'turns' {
  if (!combat) return 'free';
  return combat.peaceful ? 'turns' : 'fight';
}

/** "3 rd" in a fight, "9 min left" out of one; undefined for an effect that lasts until it is ended. */
export function effectLeft(
  e: Pick<Effect, 'rounds' | 'endsAt'>,
  { now, fighting }: { now: number; fighting: boolean },
): string | undefined {
  if (fighting && e.rounds !== undefined) return `${e.rounds} rd`;
  if (e.endsAt !== undefined) return `${formatDuration(e.endsAt - now)} left`;
  return e.rounds === undefined ? undefined : `${e.rounds} rd`;
}

/** "Frost 30" lines as months; lines that don't end in a number are left out. */
export function parseMonths(text: string): { name: string; days: number }[] {
  return text.split('\n').flatMap((line) => {
    const words = line.trim().split(/\s+/);
    const days = Number(words.at(-1));
    const name = words.slice(0, -1).join(' ');
    return name && Number.isInteger(days) && days > 0 ? [{ name, days }] : [];
  });
}

/** "1 Jan 1492, 10:00": the date in the top bar (the weekday is in its tooltip). */
export function shortDate(calendar: Calendar, time: number): string {
  const d = dateOf(calendar, time);
  const month = calendar.months[d.month]!.name.slice(0, 3);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.day} ${month} ${d.year}, ${pad(d.hour)}:${pad(d.minute)}`;
}

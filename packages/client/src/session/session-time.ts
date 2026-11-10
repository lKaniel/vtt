import { twilightGlow } from '../canvas/lighting/light-style.ts';
import type { Doc } from '@vtt/core';
import {
  type Calendar,
  type Clock,
  CLOCK_COLL,
  CLOCK_ID,
  ClockSchema,
  DAY,
  dateOf,
  formatDate,
  formatDuration,
  HOUR,
  MINUTE,
  timeNow,
} from '@vtt/shared';
import type { Combat, Effect } from '@vtt/system-dnd5e';
import type { SessionPart, Welcome } from './session-part.ts';

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

const SHORT: [number, string][] = [
  [DAY, 'd'],
  [HOUR, 'h'],
  [MINUTE, 'm'],
  [1, 's'],
];

/** What a portrait badge shows: rounds in a fight, "9m" or "8h" of game time out of one. */
export function effectBadge(
  e: Pick<Effect, 'rounds' | 'endsAt'>,
  { now, fighting }: { now: number; fighting: boolean },
): string | undefined {
  if ((fighting || e.endsAt === undefined) && e.rounds !== undefined) return String(e.rounds);
  if (e.endsAt === undefined) return undefined;
  const left = Math.max(0, e.endsAt - now);
  const [size, unit] = SHORT.find(([size]) => left >= size) ?? [1, 's'];
  return `${Math.floor(left / size)}${unit}`;
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

/** The game clock as this client reads it: time.json, run by the server's time. */
export class WorldTime implements SessionPart {
  /** How far the server's clock (ms) is ahead of this browser's. */
  private serverOffset = 0;

  constructor(private readonly s: { readonly docs: { get(coll: string, id: string): Doc | undefined } }) {}

  /** The game clock and its calendar. */
  clock(): Clock {
    const doc = this.s.docs.get(CLOCK_COLL, CLOCK_ID);
    const { type: _t, rev: _r, id: _id, ...data } = doc ?? { type: '', rev: 0, id: '' };
    return ClockSchema.parse(data);
  }

  /** Game seconds now. */
  now(): number {
    return timeNow(this.clock(), Date.now() + this.serverOffset);
  }

  /** The orange of dawn and dusk on a scene whose darkness follows the clock, 0 to 1. */
  glow(world: { darkness: number; darknessFollowsClock?: boolean }): number {
    return world.darknessFollowsClock ? twilightGlow(world.darkness, this.clock().calendar.night) : 0;
  }

  /** "Monday, 3 March 1492 DR, 14:05" */
  dateText(): string {
    return formatDate(this.clock().calendar, this.now());
  }

  welcome(msg: Welcome): void {
    this.serverOffset = msg.serverTime === undefined ? 0 : msg.serverTime - Date.now();
  }
}

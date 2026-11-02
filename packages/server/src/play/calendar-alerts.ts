import type { Doc } from '@vtt/core';
import { canSee, isGm, type Player } from '@vtt/shared';

// Calendar notes on world time: a journal entry with a `date` (journals.ts)
// is said in the chat when the clock reaches it, to everyone who may read
// the entry, or else only to the GM. Time going back says nothing again
// until it passes a note anew.

export type Say = (text: string, gmOnly: boolean) => void;

export class CalendarAlerts {
  constructor(
    private say: Say,
    /** The game time last looked at. */
    private last: number,
  ) {}

  /** The clock is at `now`: says the notes it has passed since last time. */
  reached(now: number, entries: readonly Doc[], players: readonly Player[]): void {
    const from = this.last;
    this.last = now;
    if (now <= from) return;
    const due = entries.filter((d) => typeof d.date === 'number' && d.date > from && d.date <= now);
    const seats = players.filter((p) => !isGm(p));
    for (const d of due.toSorted((a, b) => (a.date as number) - (b.date as number))) {
      const everyone = seats.length > 0 && seats.every((p) => canSee(d as Parameters<typeof canSee>[0], p));
      this.say(`Today: ${String(d.name)}`, !everyone);
    }
  }
}

// Live things a client tells the table as the pointer moves (rulers, cursors):
// at most every `interval` ms, and the latest state when the wait is over.

export interface Timing {
  interval: number;
  now: () => number;
  /** Runs `fn` after `ms`. */
  later: (fn: () => void, ms: number) => void;
}

export const BROWSER: Timing = {
  interval: 50,
  now: () => performance.now(),
  later: (fn, ms) => {
    setTimeout(fn, ms);
  },
};

export class Throttle {
  private lastSent = -Infinity;
  private pending = false;

  /** `flush` tells the table the state as it is when it runs. */
  constructor(
    private flush: () => void,
    private timing: Timing = BROWSER,
  ) {}

  /** The state changed; `now` tells the table straight away. */
  update(now: boolean): void {
    const wait = this.lastSent + this.timing.interval - this.timing.now();
    if (now || wait <= 0) return this.send();
    if (this.pending) return;
    this.pending = true;
    this.timing.later(() => this.send(), wait);
  }

  private send(): void {
    this.pending = false;
    this.lastSent = this.timing.now();
    this.flush();
  }
}

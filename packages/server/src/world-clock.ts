import {
  type Calendar,
  CalendarSchema,
  type Clock,
  CLOCK_COLL,
  CLOCK_ID,
  type ClockAction,
  clockAfterFight,
  clockInFight,
  ClockSchema,
  formatDate,
  formatDuration,
  type Player,
  skipClock,
  startClock,
  stopClock,
  timeNow,
} from '@vtt/shared';
import { fromDoc, toDoc } from './doc-sync.ts';
import { putOps } from './token-ops.ts';
import { requireGm, type Table } from './table.ts';
import { TimeOut } from './time-out.ts';
import { CalendarAlerts, type Say } from './calendar-alerts.ts';

// The game clock (time.json, see clock.ts in shared). The GM starts, stops
// and skips it; rests skip it; in a fight (or turn-based mode) it holds still
// and each round adds 6 seconds. After every step the clock catches up with
// the fight, what has run out ends (time-out.ts) and calendar notes it
// reached are said (calendar-alerts.ts). While it runs, a tick each second
// does the same as time goes by, as a step of its own.

const TICK_MS = 1000;

export interface ClockHooks {
  /** The server's time in ms. */
  now: () => number;
  /** Runs the tick as an undo step ("time passing"). */
  step: (fn: () => void) => void;
  /** Says something in the chat (calendar notes as the clock reaches them). */
  say?: Say;
}

export class WorldClock {
  private out: TimeOut;
  private alerts: CalendarAlerts;
  private timer?: NodeJS.Timeout;
  /** Darkness and weather last told to the clients of each scene that follows the clock. */
  private lit = new Map<string, string>();

  constructor(
    private table: Table,
    private hooks: ClockHooks,
  ) {
    this.out = new TimeOut(table);
    if (!this.store.docs.get(CLOCK_COLL, CLOCK_ID)) this.put(ClockSchema.parse({}));
    this.alerts = new CalendarAlerts(hooks.say ?? (() => undefined), this.now());
    this.store.on('docs', (changes) => {
      if (changes.some((c) => c.coll === CLOCK_COLL || c.coll === 'scenes')) this.changed();
    });
    this.changed();
  }

  private get store() {
    return this.table.store;
  }

  /** The clock as time.json has it. */
  current(): Clock {
    const doc = this.store.docs.get(CLOCK_COLL, CLOCK_ID);
    return ClockSchema.parse(doc ? fromDoc(doc, false) : {});
  }

  /** The server's time in ms, that the clock runs by. */
  serverTime(): number {
    return this.hooks.now();
  }

  /** Game seconds now. */
  now(): number {
    return timeNow(this.current(), this.hooks.now());
  }

  /** GM: does what the `clock` message asks. */
  act(player: Player, action: ClockAction): void {
    requireGm(player);
    const at = this.hooks.now();
    const clock = this.current();
    switch (action.do) {
      case 'start':
        this.put(startClock(clock, at));
        return this.table.note(`The clock runs: ${this.date()}`);
      case 'stop':
        this.put(stopClock(clock, at));
        return this.table.note(`The clock stops: ${this.date()}`);
      case 'skip':
        return this.skip(action.seconds);
      case 'set':
        this.put({ ...clock, time: action.time, ...(clock.since === undefined ? {} : { since: at }) });
        return this.table.note(this.date());
      default:
        return this.change(clock, action);
    }
  }

  private change(clock: Clock, action: Extract<ClockAction, { do: 'speed' | 'calendar' }>): void {
    if (action.do === 'speed') {
      const at = this.hooks.now();
      const since = clock.since === undefined ? {} : { since: at };
      this.put({ ...clock, time: timeNow(clock, at), speed: action.speed, ...since });
      return this.table.note(`Time runs ${action.speed}× as fast`);
    }
    const calendar: Calendar = CalendarSchema.parse({ ...clock.calendar, ...action.calendar });
    this.put({ ...clock, calendar });
    this.table.note(this.date());
  }

  /** Lets `seconds` of game time pass (a rest, the GM skipping ahead). */
  skip(seconds: number): void {
    this.put(skipClock(this.current(), seconds, this.hooks.now()));
    this.table.note(`${formatDuration(seconds)} pass: ${this.date()}`);
  }

  /** After a step: the clock follows the fight, then what ran out ends. */
  settle(): void {
    const clock = this.current();
    const at = this.hooks.now();
    const combat = this.store.combat;
    const next = combat ? clockInFight(clock, combat.round, at) : clockAfterFight(clock, at);
    if (next !== clock) this.put(next);
    const now = timeNow(next, at);
    if (combat && clock.round === undefined)
      this.store.inScene(this.store.activeScene, () => this.out.fightStarts(now));
    this.out.settle(now);
    this.alerts.reached(now, this.store.docs.all('journals'), this.store.world.players);
  }

  /** Each second while the clock runs. */
  tick(): void {
    this.hooks.step(() => undefined);
    this.light();
  }

  close(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private date(): string {
    return formatDate(this.current().calendar, this.now());
  }

  private put(clock: Clock): void {
    this.store.applyOps(putOps(this.store.docs, CLOCK_COLL, toDoc('clock', clock, CLOCK_ID)));
  }

  /** The clock or a scene changed: run or stop the tick, and relight the scenes that follow the clock. */
  private changed(): void {
    const running = this.current().since !== undefined;
    if (running && !this.timer) {
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.timer.unref();
    } else if (!running) this.close();
    this.light();
  }

  /** Tells the clients of scenes that follow the clock how dark it is now and the weather, when that changed. */
  private light(): void {
    for (const scene of this.store.sceneIds()) {
      const world = this.store.inScene(scene, () => this.store.world);
      const follows = this.store.inScene(scene, () => this.followsClock());
      if (!follows) {
        this.lit.delete(scene);
        continue;
      }
      const was = this.lit.get(scene);
      const sky = { darkness: world.darkness, weather: world.weather ?? [] };
      this.lit.set(scene, JSON.stringify(sky));
      if (was === undefined || was === this.lit.get(scene)) continue;
      const before = JSON.parse(was) as typeof sky;
      if (before.darkness !== sky.darkness) this.store.emit('lighting', sky.darkness, scene);
      if (JSON.stringify(before.weather) !== JSON.stringify(sky.weather))
        this.store.emit('weather', sky.weather, scene);
    }
  }

  /** Whether the current scene's darkness or weather follows the clock. */
  private followsClock(): boolean {
    const doc = this.store.docs.get('scenes', this.store.currentScene);
    return doc?.darknessFollowsClock === true || !!doc?.weatherCycle;
  }
}

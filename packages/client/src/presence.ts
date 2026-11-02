import type { Player, Point } from '@vtt/shared';
import { whole } from './rulers.ts';
import { BROWSER, Throttle, type Timing } from './throttle.ts';

// Where everyone else at the table is pointing: their cursors, live, and
// pings, a spot someone points out with a long press (the GM's Shift+long
// press pulls everyone's view there). Yours go to the table as the pointer
// moves, at most every 50 ms (see throttle.ts); nothing is saved.

/** How long a ping shows, in ms. */
export const PING_MS = 2500;
/** How long a press must hold still to ping, in ms. */
const LONG_PRESS_MS = 500;
/** How far (screen pixels) a long press may wander and still ping. */
const STILL = 6;

interface Who {
  player: string;
  name: string;
  color: string;
}

type ShownCursor = Who & { at: Point };
export type ShownPing = Who & { at: Point; since: number };

/** What the server says about the others. */
export type PresenceNews = (Who & { t: 'cursor'; at: Point | null }) | (Who & { t: 'ping'; at: Point; pull?: boolean });

type PresenceSend = { t: 'cursor'; at: Point | null } | { t: 'ping'; at: Point; pull?: boolean };

interface PresenceHooks {
  send: (msg: PresenceSend) => void;
  /** The cursors or pings changed. */
  changed: () => void;
  /** Brings your view to a spot. */
  focus: (at: Point) => void;
  you: () => Pick<Player, 'id' | 'name' | 'color'> | undefined;
}

export class Presence {
  readonly cursors = new Map<string, ShownCursor>();
  private shown: ShownPing[] = [];
  /** Where your pointer is on the map; null: off it. */
  private at: Point | null = null;
  private throttle: Throttle;

  constructor(
    private hooks: PresenceHooks,
    private timing: Timing = BROWSER,
  ) {
    this.throttle = new Throttle(() => hooks.send({ t: 'cursor', at: this.at }), timing);
  }

  /** Your pointer moved to `p` on the map (null: it left the map). */
  pointer(p: Point | null): void {
    const at = p && whole(p);
    if (String(at) === String(this.at)) return;
    this.at = at;
    this.throttle.update(at === null);
  }

  /** You ping `p`; `pull` (the GM) brings everyone's view there. */
  ping(p: Point, pull: boolean): void {
    const at = whole(p);
    this.hooks.send(pull ? { t: 'ping', at, pull } : { t: 'ping', at });
    const you = this.hooks.you();
    if (you) this.show({ player: you.id, name: you.name, color: you.color, at });
  }

  /** The pings showing at `now`, oldest first. */
  pings(now: number): ShownPing[] {
    this.shown = this.shown.filter((p) => now - p.since < PING_MS);
    return this.shown;
  }

  /** Someone else moved their cursor or pinged. */
  receive(msg: PresenceNews): void {
    const { player, name, color } = msg;
    if (msg.t === 'ping') {
      if (msg.pull) this.hooks.focus(msg.at);
      return this.show({ player, name, color, at: msg.at });
    }
    const at = msg.at;
    if (at) this.cursors.set(player, { player, name, color, at });
    else this.cursors.delete(player);
    this.hooks.changed();
  }

  /** A fresh start (joining, a new scene): nobody else's cursor or pings. */
  reset(): void {
    this.cursors.clear();
    this.shown = [];
    this.at = null;
    this.hooks.changed();
  }

  private show(who: Who & { at: Point }): void {
    this.shown.push({ ...who, since: this.timing.now() });
    this.hooks.changed();
  }
}

/** Runs `fn` after `ms`; the returned function calls it off. */
type Later = (fn: () => void, ms: number) => () => void;

const browserLater: Later = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/** A press on the map that holds still long enough pings where it was pressed. */
export class LongPress {
  /** The press waiting to ping: when and where it started. */
  private held?: { screen: Point; world: Point; shift: boolean; since: number };
  private cancel?: () => void;
  private fired = false;

  constructor(
    private onPress: (at: Point, pull: boolean) => void,
    private later: Later = browserLater,
    private now: () => number = () => performance.now(),
  ) {}

  /** A press at `screen` (`world` on the map); `shift` held asks to pull everyone's view. */
  down(screen: Point, world: Point, shift: boolean): void {
    this.stop();
    this.fired = false;
    this.held = { screen, world, shift, since: this.now() };
    this.cancel = this.later(() => this.fire(), LONG_PRESS_MS);
  }

  move(screen: Point): void {
    const start = this.held?.screen;
    if (start && Math.hypot(screen[0] - start[0], screen[1] - start[1]) > STILL) this.stop();
  }

  /** Let go: true if this press pinged (so it is not also a click). */
  up(): boolean {
    // A busy page may run the timer late: a press held long enough still pings.
    if (this.held && this.now() - this.held.since >= LONG_PRESS_MS) this.fire();
    this.stop();
    const fired = this.fired;
    this.fired = false;
    return fired;
  }

  private fire(): void {
    const held = this.held;
    this.stop();
    if (!held) return;
    this.fired = true;
    this.onPress(held.world, held.shift);
  }

  private stop(): void {
    this.cancel?.();
    this.cancel = undefined;
    this.held = undefined;
  }
}

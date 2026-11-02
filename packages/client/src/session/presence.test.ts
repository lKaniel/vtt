import type { Point } from '@vtt/shared';
import { describe, expect, it, vi } from 'vitest';
import { LongPress, PING_MS, Presence } from './presence.ts';

function table() {
  let now = 0;
  const sent: unknown[] = [];
  const changed = vi.fn();
  const focus = vi.fn();
  const timers: (() => void)[] = [];
  const timing = {
    interval: 50,
    now: () => now,
    later: (fn: () => void) => {
      timers.push(fn);
    },
  };
  const you = { id: 'gm', name: 'GM', color: '#fff' };
  const presence = new Presence({ send: (m) => sent.push(m), changed, focus, you: () => you }, timing);
  return {
    presence,
    sent,
    changed,
    focus,
    timing,
    wait: (ms: number) => {
      now += ms;
    },
    fire: () => timers.splice(0).forEach((fn) => fn()),
  };
}

const ana = { player: 'ana', name: 'Ana', color: '#f00' };

describe('your cursor', () => {
  it('tells the table where you point at most every 50 ms, in whole pixels, and when you leave the map', () => {
    const { presence, sent, wait, fire } = table();
    presence.pointer([10.4, 20.6]);
    expect(sent).toEqual([{ t: 'cursor', at: [10, 21] }]);
    wait(10);
    presence.pointer([30, 30]);
    presence.pointer([40, 40]);
    expect(sent).toHaveLength(1);
    wait(40);
    fire();
    expect(sent.at(-1)).toEqual({ t: 'cursor', at: [40, 40] });
    presence.pointer(null);
    expect(sent.at(-1)).toEqual({ t: 'cursor', at: null });
  });

  it('says nothing when it has not moved, nor when it is off the map already', () => {
    const { presence, sent, wait } = table();
    presence.pointer(null);
    presence.pointer([1, 1]);
    wait(100);
    presence.pointer([1.2, 1]);
    expect(sent).toEqual([{ t: 'cursor', at: [1, 1] }]);
  });
});

describe('the cursors of others', () => {
  it('shows each one until it leaves the map, and none after a fresh start', () => {
    const { presence, changed } = table();
    presence.receive({ t: 'cursor', ...ana, at: [5, 5] });
    presence.receive({ t: 'cursor', ...ana, player: 'bo', at: [6, 6] });
    expect([...presence.cursors.keys()]).toEqual(['ana', 'bo']);
    presence.receive({ t: 'cursor', ...ana, at: null });
    expect([...presence.cursors.keys()]).toEqual(['bo']);
    presence.reset();
    expect(presence.cursors.size).toBe(0);
    expect(changed).toHaveBeenCalled();
  });
});

describe('pings', () => {
  it('yours goes to the table and shows on your map in your colour', () => {
    const { presence, sent } = table();
    presence.ping([100.2, 50], false);
    expect(sent).toEqual([{ t: 'ping', at: [100, 50] }]);
    expect(presence.pings(0)).toEqual([{ player: 'gm', name: 'GM', color: '#fff', at: [100, 50], since: 0 }]);
    presence.ping([1, 1], true);
    expect(sent.at(-1)).toEqual({ t: 'ping', at: [1, 1], pull: true });
  });

  it('others’ show for a while, and a pull brings your view to the spot', () => {
    const { presence, focus, wait } = table();
    presence.receive({ t: 'ping', ...ana, at: [7, 7] });
    expect(focus).not.toHaveBeenCalled();
    wait(500);
    presence.receive({ t: 'ping', ...ana, at: [9, 9], pull: true });
    expect(focus).toHaveBeenCalledWith([9, 9]);
    expect(presence.pings(600).map((p) => p.at)).toEqual([
      [7, 7],
      [9, 9],
    ]);
    expect(presence.pings(PING_MS + 100).map((p) => p.at)).toEqual([[9, 9]]);
    expect(presence.pings(PING_MS + 600)).toEqual([]);
  });
});

describe('a long press', () => {
  function press() {
    const fired = vi.fn<(at: Point, pull: boolean) => void>();
    const timers: (() => void)[] = [];
    let now = 0;
    const later = (fn: () => void) => {
      timers.push(fn);
      return () => timers.splice(timers.indexOf(fn), 1);
    };
    const lp = new LongPress(fired, later, () => now);
    const wait = (ms: number) => {
      now += ms;
    };
    return { lp, fired, wait, fire: () => timers.splice(0).forEach((fn) => fn()) };
  }

  it('held long enough pings on letting go even when a busy page ran its timer late', () => {
    const { lp, fired, wait } = press();
    lp.down([0, 0], [5, 5], false);
    wait(600);
    expect(lp.up()).toBe(true);
    expect(fired).toHaveBeenCalledWith([5, 5], false);
  });

  it('that holds still pings where it was pressed, and swallows the click', () => {
    const { lp, fired, fire } = press();
    lp.down([10, 10], [100, 100], false);
    lp.move([12, 11]);
    fire();
    expect(fired).toHaveBeenCalledWith([100, 100], false);
    expect(lp.up()).toBe(true);
    expect(lp.up()).toBe(false);
  });

  it('with Shift asks to pull everyone’s view', () => {
    const { lp, fired, fire } = press();
    lp.down([0, 0], [5, 5], true);
    fire();
    expect(fired).toHaveBeenCalledWith([5, 5], true);
  });

  it('that moves away, or lets go first, is just a drag or a click', () => {
    const { lp, fired, fire } = press();
    lp.down([10, 10], [100, 100], false);
    lp.move([30, 10]);
    fire();
    expect(lp.up()).toBe(false);
    lp.down([10, 10], [100, 100], false);
    expect(lp.up()).toBe(false);
    fire();
    expect(fired).not.toHaveBeenCalled();
  });
});

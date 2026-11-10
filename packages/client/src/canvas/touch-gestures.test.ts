import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Fingers, LongPress, LONG_PRESS_MS } from './touch-gestures.ts';

describe('Fingers', () => {
  it('makes no pinch with one finger down', () => {
    const f = new Fingers();
    f.down(1, [0, 0]);
    expect(f.move(1, [10, 0])).toBeUndefined();
    expect(f.count).toBe(1);
  });

  it('spreading two fingers zooms in around their midpoint', () => {
    const f = new Fingers();
    f.down(1, [100, 100]);
    f.down(2, [200, 100]);
    const pinch = f.move(2, [300, 100])!;
    expect(pinch.scale).toBeCloseTo(2);
    expect(pinch.centre).toEqual([200, 100]);
    expect(pinch.pan).toEqual([50, 0]);
    expect(pinch.turn).toBeCloseTo(0);
  });

  it('moving both fingers together pans, and twisting them turns', () => {
    const f = new Fingers();
    f.down(1, [0, 0]);
    f.down(2, [100, 0]);
    expect(f.move(1, [0, 30])!.pan).toEqual([0, 15]);
    const twist = new Fingers();
    twist.down(1, [0, 0]);
    twist.down(2, [100, 0]);
    expect(twist.move(2, [0, 100])!.turn).toBeCloseTo(Math.PI / 2);
  });

  it('forgets a finger let go, and ignores one it never saw', () => {
    const f = new Fingers();
    f.down(1, [0, 0]);
    f.down(2, [100, 0]);
    f.up(1);
    expect(f.count).toBe(1);
    expect(f.move(2, [150, 0])).toBeUndefined();
    expect(f.move(7, [1, 1])).toBeUndefined();
  });
});

describe('LongPress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires when a finger is held still', () => {
    const press = new LongPress();
    const fire = vi.fn();
    press.begin([10, 10], fire);
    press.move([14, 12]);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(fire).toHaveBeenCalledOnce();
    expect(press.fired).toBe(true);
  });

  it('does not fire once the finger moves away or lifts', () => {
    const fire = vi.fn();
    const moved = new LongPress();
    moved.begin([10, 10], fire);
    moved.move([40, 10]);
    const lifted = new LongPress();
    lifted.begin([10, 10], fire);
    lifted.cancel();
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(fire).not.toHaveBeenCalled();
    expect(moved.fired).toBe(false);
  });

  it('starts over for each press', () => {
    const press = new LongPress();
    press.begin([0, 0], () => undefined);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    press.begin([0, 0], () => undefined);
    expect(press.fired).toBe(false);
  });
});

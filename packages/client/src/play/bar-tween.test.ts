import { describe, expect, it } from 'vitest';
import { BarTween, HOLD_MAX, TRAIL_DELAY } from './bar-tween.ts';

/** Steps the tween in 16 ms frames from `from` to `to`. */
function run(bar: BarTween, from: number, to: number): void {
  for (let t = from; t <= to; t += 16) bar.step(t);
}

describe('BarTween', () => {
  it('starts still at its value', () => {
    const bar = new BarTween(1);
    expect(bar.step(0)).toBe(false);
    expect([bar.shown, bar.trail]).toEqual([1, 1]);
  });

  it('holds a hit until the blow lands, then drops the bar and drains the trail after it', () => {
    const bar = new BarTween(1);
    bar.set(0.4, 0);
    run(bar, 0, 100);
    expect(bar.shown).toBe(1);
    bar.release(100);
    run(bar, 100, 300);
    expect(bar.shown).toBeCloseTo(0.4, 2);
    // The pale trail still marks what was lost.
    expect(bar.trail).toBe(1);
    run(bar, 300, 100 + TRAIL_DELAY + 2000);
    expect(bar.trail).toBeCloseTo(0.4, 5);
    expect(bar.step(5000)).toBe(false);
  });

  it('lets go by itself when no blow is played for it', () => {
    const bar = new BarTween(1);
    bar.set(0.5, 0);
    run(bar, 0, HOLD_MAX + 400);
    expect(bar.shown).toBeCloseTo(0.5, 2);
  });

  it('fills up on healing with no trail', () => {
    const bar = new BarTween(0.2);
    bar.set(0.8, 0);
    bar.release(0);
    run(bar, 0, 600);
    expect(bar.shown).toBeCloseTo(0.8, 2);
    expect(bar.trail).toBe(bar.shown);
  });

  it('jumps straight to a value when told to, e.g. a token seen for the first time', () => {
    const bar = new BarTween(1);
    bar.jump(0.3);
    expect([bar.shown, bar.trail, bar.step(0)]).toEqual([0.3, 0.3, false]);
  });
});

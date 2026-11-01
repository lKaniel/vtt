import type { Point, Rect } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { EditorController, type EditorHost } from './controller.ts';

const none = { shift: false, ctrl: false, alt: false };

/** Two things: "a" around (0, 0) and "b" around (100, 0); "a" has a handle at (0, 20). */
function host(selected: string[] = []) {
  const calls: unknown[] = [];
  const h: EditorHost & { selected: string[]; calls: unknown[] } = {
    selected,
    calls,
    pick: (p: Point) => (Math.abs(p[1]) > 10 ? undefined : ['a', 'b'].find((_, i) => Math.abs(p[0] - i * 100) < 10)),
    pickHandle: (p: Point) =>
      h.selected.includes('a') && Math.hypot(p[0], p[1] - 20) < 5 ? { key: 'a', handle: 'end' } : undefined,
    inRect: (r: Rect, mode) => {
      calls.push(['inRect', r, mode]);
      return ['a', 'b'].filter((_, i) => i * 100 >= r.x && i * 100 <= r.x + r.w);
    },
    selection: () => h.selected,
    setSelection: (keys) => {
      h.selected = keys;
    },
    slop: () => 5,
    commitMove: (keys, delta, free) => calls.push(['move', keys, delta, free]),
    commitHandle: (key, handle, to, free) => calls.push(['handle', key, handle, to, free]),
  };
  return h;
}

describe('EditorController', () => {
  it('a click selects what is under the pointer, and empty space deselects', () => {
    const h = host();
    const c = new EditorController(h);
    c.down([1, 1], none);
    c.up([1, 1], none);
    expect(h.selected).toEqual(['a']);
    c.down([50, 50], none);
    c.up([51, 50], none);
    expect(h.selected).toEqual([]);
  });

  it('shift-click adds to the selection', () => {
    const h = host(['a']);
    const c = new EditorController(h);
    c.down([100, 0], { ...none, shift: true });
    c.up([100, 0], { ...none, shift: true });
    expect(h.selected).toEqual(['a', 'b']);
  });

  it('dragging from empty space draws a marquee and selects what it touches', () => {
    const h = host();
    const c = new EditorController(h);
    c.down([-20, -20], none);
    c.move([50, 20], none);
    expect(c.preview()).toEqual({ kind: 'marquee', rect: { x: -20, y: -20, w: 70, h: 40 } });
    c.up([150, 20], none);
    expect(h.selected).toEqual(['a', 'b']);
    expect(h.calls[0]).toEqual(['inRect', { x: -20, y: -20, w: 170, h: 40 }, 'touch']);
    expect(c.preview()).toBeUndefined();
  });

  it('alt makes the marquee take only what it holds whole', () => {
    const h = host();
    const c = new EditorController(h);
    c.down([-20, -20], { ...none, alt: true });
    c.up([150, 20], { ...none, alt: true });
    expect(h.calls[0]).toEqual(['inRect', { x: -20, y: -20, w: 170, h: 40 }, 'contain']);
  });

  it('dragging an unselected thing selects and moves it', () => {
    const h = host(['b']);
    const c = new EditorController(h);
    c.down([0, 0], none);
    c.move([30, 0], none);
    expect(h.selected).toEqual(['a']);
    expect(c.preview()).toEqual({ kind: 'move', keys: ['a'], delta: [30, 0], free: false });
    c.up([40, 5], { ...none, shift: true });
    expect(h.calls).toEqual([['move', ['a'], [40, 5], true]]);
  });

  it('dragging a selected thing moves the whole selection', () => {
    const h = host(['a', 'b']);
    const c = new EditorController(h);
    c.down([100, 0], none);
    c.move([100, 50], none);
    c.up([100, 60], none);
    expect(h.calls).toEqual([['move', ['a', 'b'], [0, 60], false]]);
  });

  it('a move that never left the slop is a click', () => {
    const h = host(['a', 'b']);
    const c = new EditorController(h);
    c.down([100, 0], none);
    c.move([102, 0], none);
    c.up([102, 0], none);
    expect(h.calls).toEqual([]);
    expect(h.selected).toEqual(['b']);
  });

  it('dragging a handle of a selected thing reshapes it', () => {
    const h = host(['a']);
    const c = new EditorController(h);
    c.down([0, 20], none);
    c.move([10, 40], none);
    expect(c.preview()).toEqual({ kind: 'handle', key: 'a', handle: 'end', to: [10, 40], free: false });
    c.up([10, 50], none);
    expect(h.calls).toEqual([['handle', 'a', 'end', [10, 50], false]]);
    expect(h.selected).toEqual(['a']);
  });

  it('cancel drops the gesture without changing anything', () => {
    const h = host(['a']);
    const c = new EditorController(h);
    c.down([0, 0], none);
    c.move([50, 0], none);
    expect(c.busy).toBe(true);
    c.cancel();
    c.up([60, 0], none);
    expect(h.calls).toEqual([]);
    expect(c.busy).toBe(false);
  });
});

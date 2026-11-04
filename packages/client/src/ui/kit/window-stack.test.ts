import { describe, expect, it } from 'vitest';
import { cascade, clampPlace, readPlace, resized, WindowStack, writePlace } from './window-stack.ts';

const view = { width: 1600, height: 900 };

function memory() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => {
      items.set(k, v);
    },
  };
}

describe('the window stack', () => {
  it('puts the last raised window on top', () => {
    const stack = new WindowStack();
    stack.raise('sheet');
    stack.raise('journal');
    expect(stack.zOf('journal')).toBeGreaterThan(stack.zOf('sheet'));
    stack.raise('sheet');
    expect(stack.zOf('sheet')).toBeGreaterThan(stack.zOf('journal'));
  });

  it('forgets a closed window and tells who listens', () => {
    const stack = new WindowStack();
    let calls = 0;
    stack.subscribe(() => calls++);
    stack.raise('a');
    stack.raise('b');
    stack.remove('a');
    expect(stack.top()).toBe('b');
    stack.remove('b');
    expect(stack.top()).toBeUndefined();
    expect(calls).toBe(4);
  });

  it('keeps windows under the popovers and menus (z 1000)', () => {
    const stack = new WindowStack();
    for (let i = 0; i < 50; i++) stack.raise(`w${i}`);
    expect(stack.zOf('w49')).toBeLessThan(1000);
  });

  it('closes the top window that can be closed (Esc)', () => {
    const stack = new WindowStack();
    const closed: string[] = [];
    stack.raise('sheet');
    stack.setCloser('sheet', () => closed.push('sheet'));
    stack.raise('journal');
    stack.setCloser('journal', () => closed.push('journal'));
    stack.raise('dialog');
    expect(stack.closeTop()).toBe(true);
    expect(closed).toEqual(['journal']);
    stack.remove('journal');
    stack.setCloser('journal', undefined);
    expect(stack.closeTop()).toBe(true);
    expect(closed).toEqual(['journal', 'sheet']);
    stack.remove('sheet');
    expect(stack.closeTop()).toBe(false);
  });

  it('does not tell anyone when the top window is raised again', () => {
    const stack = new WindowStack();
    stack.raise('a');
    let calls = 0;
    stack.subscribe(() => calls++);
    stack.raise('a');
    expect(calls).toBe(0);
  });
});

describe('a window place', () => {
  it('keeps the title bar on screen', () => {
    expect(clampPlace({ x: -2000, y: -50 }, { width: 400, height: 300 }, view)).toEqual({ x: -320, y: 0 });
    expect(clampPlace({ x: 5000, y: 5000 }, { width: 400, height: 300 }, view)).toEqual({ x: 1520, y: 868 });
  });

  it('keeps its size', () => {
    expect(clampPlace({ x: 10, y: 10, w: 500, h: 400 }, { width: 500, height: 400 }, view)).toEqual({
      x: 10,
      y: 10,
      w: 500,
      h: 400,
    });
  });

  it('grows from the corner but never below the smallest size', () => {
    expect(resized({ x: 0, y: 0, w: 500, h: 400 }, 40, -30)).toEqual({ x: 0, y: 0, w: 540, h: 370 });
    expect(resized({ x: 0, y: 0, w: 500, h: 400 }, -900, -900)).toEqual({ x: 0, y: 0, w: 260, h: 120 });
  });

  it('steps each new window of a kind down and right of the last', () => {
    expect(cascade({ x: 100, y: 80 }, 0)).toEqual({ x: 100, y: 80 });
    expect(cascade({ x: 100, y: 80 }, 2)).toEqual({ x: 160, y: 140 });
  });

  it('is remembered in this browser', () => {
    const storage = memory();
    expect(readPlace('journal', storage)).toBeUndefined();
    writePlace('journal', { x: 12, y: 34, w: 500 }, storage);
    expect(readPlace('journal', storage)).toEqual({ x: 12, y: 34, w: 500 });
  });

  it('ignores a stored place that is not one', () => {
    const storage = memory();
    storage.setItem('vtt:window-journal', '{"x":"left"}');
    expect(readPlace('journal', storage)).toBeUndefined();
    storage.setItem('vtt:window-journal', 'not json');
    expect(readPlace('journal', storage)).toBeUndefined();
  });
});

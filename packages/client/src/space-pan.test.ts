import { describe, expect, it } from 'vitest';
import { SpaceKey } from './space-pan.ts';

describe('space key', () => {
  it('a tap is a tap (it ends your turn)', () => {
    const space = new SpaceKey();
    space.press();
    expect(space.held).toBe(true);
    expect(space.release()).toBe(true);
    expect(space.held).toBe(false);
  });

  it('held while dragging the map pans, and letting go is no tap', () => {
    const space = new SpaceKey();
    space.press();
    space.panned();
    space.press(); // the key repeats while held
    expect(space.release()).toBe(false);
    space.press();
    expect(space.release()).toBe(true);
  });

  it('a release without a press is no tap (the window lost focus meanwhile)', () => {
    const space = new SpaceKey();
    space.press();
    space.reset();
    expect(space.release()).toBe(false);
  });
});

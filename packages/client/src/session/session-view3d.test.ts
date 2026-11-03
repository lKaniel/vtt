import { describe, expect, it, vi } from 'vitest';
import { View3DSwitch } from './session-view3d.ts';

describe('the 3D switch', () => {
  it('starts as the browser left it, and tells the map when it flips', () => {
    const changed = vi.fn();
    const view = new View3DSwitch({ changed }, 'on');
    expect(view.on).toBe(true);
    view.toggle();
    expect(view.on).toBe(false);
    view.set(false);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

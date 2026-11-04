import { describe, expect, it, vi } from 'vitest';
import { View3DSwitch } from './session-view3d.ts';

const table = (view: '2d' | '3d' | undefined, gm: boolean) => ({ world: view ? { view } : {}, isGm: () => gm });

describe('the 3D view', () => {
  it('shows a 3D scene in 3D and a 2D scene flat, whatever the switch says', () => {
    const changed = vi.fn();
    const host = table('3d', false);
    const view = new View3DSwitch({ changed }, host);
    expect(view.on).toBe(true);
    host.world = { view: '2d' };
    expect(view.on).toBe(false);
    host.world = {};
    expect(view.on).toBe(false);
  });

  it('lets only the GM lay a 3D scene flat (to edit it), and not a 2D scene up', () => {
    const changed = vi.fn();
    const player = new View3DSwitch({ changed }, table('3d', false));
    expect(player.canFlip).toBe(false);
    player.toggle();
    expect(player.on).toBe(true);
    expect(changed).not.toHaveBeenCalled();

    const flat = new View3DSwitch({ changed }, table('2d', true));
    expect(flat.canFlip).toBe(false);
    flat.toggle();
    expect(flat.on).toBe(false);

    const gm = new View3DSwitch({ changed }, table('3d', true));
    expect(gm.canFlip).toBe(true);
    gm.toggle();
    expect(gm.on).toBe(false);
    gm.toggle();
    expect(gm.on).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
  });
});

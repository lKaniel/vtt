import { describe, expect, it, vi } from 'vitest';
import { DRAG_TYPE } from '../play/drops.ts';
import type { Session } from '../session/session.ts';
import { listenToDrops } from './sidebar-drops.ts';

/** A drop event with what was dragged, at this point in the window. */
function dropAt(type: string, data: string, x: number, y: number): Event {
  const e = new Event(type, { cancelable: true });
  const dataTransfer = { types: [DRAG_TYPE], getData: () => data, dropEffect: '' };
  return Object.assign(e, { dataTransfer, clientX: x, clientY: y });
}

describe('dropping from the side panel', () => {
  it('lands where the element under it says (the 2D map or the 3D view)', () => {
    const onMap = vi.fn();
    const el = Object.assign(new EventTarget(), { getBoundingClientRect: () => ({ left: 10, top: 20 }) });
    listenToDrops(el as unknown as HTMLElement, { drops: { onMap } } as unknown as Session, (x, y) => [x * 2, y * 2]);
    const over = dropAt('dragover', '', 50, 70);
    el.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    el.dispatchEvent(dropAt('drop', JSON.stringify({ kind: 'actor', id: 'goblin' }), 50, 70));
    expect(onMap).toHaveBeenCalledWith({ kind: 'actor', id: 'goblin' }, [80, 100]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { Stamp, type StampHost } from './session-stamp.ts';
import type { StampDoc } from '../editor/stamp.ts';

function host(over: Partial<StampHost> = {}) {
  const stamped: StampDoc[][] = [];
  const editor: { mode: string; tool: string } = { mode: 'tokens', tool: 'select' };
  const h: StampHost = {
    editor: {
      get mode() {
        return editor.mode as never;
      },
      get tool() {
        return editor.tool as never;
      },
      setMode: (mode, tool) => Object.assign(editor, { mode, tool }),
      setTool: (tool) => (editor.tool = tool),
    },
    tiles: { stamp: (docs) => stamped.push([...docs]) },
    gridSize: () => 100,
    changed: vi.fn(),
    random: () => 0.5,
    ...over,
  };
  return { h, stamped, editor };
}

describe('the stamp brush', () => {
  it('picks an asset up in the tiles mode, and the select tool puts it down', () => {
    const { h, editor } = host();
    const stamp = new Stamp(h, new Map());
    stamp.arm({ src: '/assets/barrel.webp', kind: 'image', size: [100, 100] });
    expect(editor).toEqual({ mode: 'tiles', tool: 'stamp' });
    expect(stamp.armed).toBe(true);
    editor.tool = 'select';
    expect(stamp.armed).toBe(false);
  });

  it('stamps a click on half squares and a drag where it went', () => {
    const { h, stamped } = host();
    const stamp = new Stamp(h, new Map());
    stamp.arm({ src: '/assets/barrel.webp', kind: 'image', size: [100, 100] });
    stamp.place([[130, 170]], false);
    expect(stamped[0]).toEqual([{ x: 100, y: 100, w: 100, h: 100, src: '/assets/barrel.webp' }]);
    stamp.place(
      [
        [0, 0],
        [130, 0],
      ],
      true,
    );
    expect(stamped[1]?.map((d) => d.x)).toEqual([-50, 80]);
  });

  it('turns and sizes what it stamps, and keeps the look for the next time', () => {
    const kept = new Map<string, string>();
    const { h, stamped } = host();
    const stamp = new Stamp(h, kept);
    stamp.arm({ src: '/assets/barrel.webp', kind: 'image', size: [100, 100] });
    stamp.turnBy(-15);
    stamp.sizeBy(2);
    stamp.place([[500, 500]], true);
    expect(stamped[0]?.[0]).toMatchObject({ w: 200, h: 200, rotation: 345 });
    expect(new Stamp(host().h, kept).look).toMatchObject({ turn: 345, scale: 2 });
  });

  it('keeps sizes sensible', () => {
    const stamp = new Stamp(host().h, new Map());
    stamp.sizeBy(1000);
    expect(stamp.look.scale).toBe(10);
    stamp.sizeBy(0);
    expect(stamp.look.scale).toBeCloseTo(0.1);
  });

  it('measures a model it does not know the size of, then stamps it at that size', async () => {
    const measure = vi.fn(() => Promise.resolve([2, 1, 1] as [number, number, number]));
    const { h, stamped } = host({ measure });
    const stamp = new Stamp(h, new Map());
    stamp.arm({ src: '/assets/cart.glb', kind: 'model' });
    await vi.waitFor(() => expect(stamp.asset?.size).toEqual([2, 1, 1]));
    stamp.place([[500, 500]], true);
    expect(stamped[0]?.[0]).toMatchObject({ w: 200, h: 100, model: { src: '/assets/cart.glb', height: 5 } });
  });

  it('remembers what was stamped last, newest first', () => {
    const stamp = new Stamp(host().h, new Map());
    for (const src of ['/a.png', '/b.png', '/a.png']) stamp.arm({ src, kind: 'image' });
    expect(stamp.recent.map((r) => r.src)).toEqual(['/a.png', '/b.png']);
  });

  it('puts nothing down with nothing picked up', () => {
    const { h, stamped } = host();
    new Stamp(h, new Map()).place([[0, 0]], false);
    expect(stamped).toEqual([]);
  });

  it('spaces a scatter by the width of what it stamps', () => {
    const stamp = new Stamp(host().h, new Map());
    stamp.arm({ src: '/assets/tree.webp', kind: 'image', size: [300, 100] });
    stamp.setLook({ spacing: 0.5 });
    expect(stamp.spacing()).toBe(150);
  });

  it('places a file dropped on the map at its own size, where it was let go, as it is (not as the brush turns it)', async () => {
    const { h, stamped } = host({ measure: () => Promise.resolve([3, 2, 1]) });
    const stamp = new Stamp(h, new Map());
    stamp.setLook({ turn: 90, randomTurn: true });
    stamp.drop('/assets/well.png', [237, 411], { w: 100, h: 100 });
    expect(stamped[0]).toEqual([{ x: 187, y: 361, w: 100, h: 100, src: '/assets/well.png' }]);
    stamp.drop('/assets/cart.glb', [500, 500]);
    await vi.waitFor(() => expect(stamped[1]?.[0]).toMatchObject({ w: 300, h: 100, model: { height: 10 } }));
  });

  it('measures a picture picked up without its size', async () => {
    const measure = vi.fn(() => Promise.resolve([400, 200]));
    const stamp = new Stamp(host({ measure }).h, new Map());
    stamp.arm({ src: '/assets/rug.webp', kind: 'image' });
    await vi.waitFor(() => expect(stamp.asset?.size).toEqual([400, 200]));
    expect(measure).toHaveBeenCalledWith({ src: '/assets/rug.webp', kind: 'image' });
  });

  it('stamps a model with its plan, waiting for the plan the first time', async () => {
    const drawers: ((path: string) => void)[] = [];
    const ready = new Map<string, string>();
    const plans = {
      of: (src: string) =>
        new Promise<string>((resolve) => {
          drawers.push((path) => {
            ready.set(src, path);
            resolve(path);
          });
        }),
      ready: (src: string) => ready.get(src),
    };
    const { h, stamped } = host({ plans });
    const stamp = new Stamp(h, new Map());
    stamp.arm({ src: '/assets/cart.glb', kind: 'model', size: [1, 1, 1] });
    stamp.place([[500, 500]], true);
    expect(stamped).toEqual([]);
    for (const draw of drawers) draw('/assets/uploads/plan-cart.webp');
    await vi.waitFor(() => expect(stamped[0]?.[0]?.src).toBe('/assets/uploads/plan-cart.webp'));
    stamp.place([[700, 500]], true);
    expect(stamped[1]?.[0]?.src).toBe('/assets/uploads/plan-cart.webp');
    expect(stamp.preview([0, 0], true)?.src).toBe('/assets/uploads/plan-cart.webp');
  });
});

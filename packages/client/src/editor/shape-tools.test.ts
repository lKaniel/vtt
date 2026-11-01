import { describe, expect, it } from 'vitest';
import { ShapeDraft } from './shape-tools.ts';

// Drawing new drawings, notes, templates, regions and sounds: what each
// tool makes from presses, drags and the finishing click. 100 px squares.

const snap = { gridSize: 100, free: false };
const free = { gridSize: 100, free: true };

describe('the shape tools', () => {
  it('drag a box for rectangles, ellipses and text, snapped to the grid', () => {
    const d = new ShapeDraft('rect');
    expect(d.press([12, 8], snap)).toBeUndefined();
    expect(d.preview([190, 230], snap)).toMatchObject({ shape: 'rect', x: 0, y: 0, w: 200, h: 200 });
    expect(d.release([190, 230], snap)).toEqual({
      mode: 'drawings',
      data: { shape: 'rect', x: 0, y: 0, w: 200, h: 200 },
    });
    expect(d.busy).toBe(false);
    const t = new ShapeDraft('text');
    t.press([0, 0], free);
    expect(t.release([150, 40], free)?.data).toEqual({ shape: 'text', x: 0, y: 0, w: 150, h: 40, text: 'Text' });
  });

  it('make nothing of a box with no size', () => {
    const d = new ShapeDraft('ellipse');
    d.press([0, 0], snap);
    expect(d.release([20, 20], snap)).toBeUndefined();
  });

  it('click point by point for polygons, closed by clicking the first point again', () => {
    const d = new ShapeDraft('polygon');
    d.press([0, 0], snap);
    d.press([200, 0], snap);
    d.press([200, 200], snap);
    expect(d.preview([0, 210], snap)?.points).toEqual([
      [0, 0],
      [200, 0],
      [200, 200],
      [0, 200],
    ]);
    expect(d.press([10, 10], snap)).toEqual({
      mode: 'drawings',
      data: {
        shape: 'polygon',
        points: [
          [0, 0],
          [200, 0],
          [200, 200],
        ],
      },
    });
  });

  it('finish lines and regions on demand, once they have enough points', () => {
    const line = new ShapeDraft('line');
    line.press([0, 0], snap);
    expect(line.finish()).toBeUndefined();
    line.press([0, 0], snap);
    line.press([300, 0], snap);
    expect(line.finish()?.data).toEqual({
      shape: 'line',
      points: [
        [0, 0],
        [300, 0],
      ],
    });
    const region = new ShapeDraft('region');
    region.press([0, 0], snap);
    region.press([100, 0], snap);
    expect(region.finish()).toBeUndefined();
    region.press([100, 100], snap);
    expect(region.finish()).toMatchObject({
      mode: 'regions',
      data: {
        points: [
          [0, 0],
          [100, 0],
          [100, 100],
        ],
      },
    });
  });

  it('draw freehand while dragging, keeping points a little apart', () => {
    const d = new ShapeDraft('freehand');
    d.press([0, 0], snap);
    d.drag([1, 1]);
    d.drag([10, 0]);
    d.drag([20, 5]);
    expect(d.release([30, 0], snap)?.data).toEqual({
      shape: 'freehand',
      points: [
        [0, 0],
        [10, 0],
        [20, 5],
        [30, 0],
      ],
    });
  });

  it('put notes and sounds down with a click, on half squares', () => {
    expect(new ShapeDraft('note').press([140, 60], snap)).toEqual({ mode: 'notes', data: { x: 150, y: 50 } });
    expect(new ShapeDraft('sound').press([140, 60], snap)).toEqual({
      mode: 'sounds',
      data: { x: 150, y: 50, radius: 30 },
    });
  });

  it('drag templates out from their origin, in 5 ft steps', () => {
    const d = new ShapeDraft('cone');
    d.press([50, 50], snap);
    expect(d.release([50, 345], snap)).toEqual({
      mode: 'templates',
      data: { shape: 'cone', x: 50, y: 50, distance: 15, direction: 90 },
    });
    const c = new ShapeDraft('circle');
    c.press([50, 50], snap);
    expect(c.release([60, 50], snap)?.data).toEqual({ shape: 'circle', x: 50, y: 50, distance: 5, direction: 0 });
    const ray = new ShapeDraft('ray');
    ray.press([50, 50], snap);
    expect(ray.release([650, 50], snap)?.data).toMatchObject({ shape: 'line', distance: 30 });
  });

  it('cancel what is half drawn', () => {
    const d = new ShapeDraft('polygon');
    d.press([0, 0], snap);
    d.cancel();
    expect(d.busy).toBe(false);
    expect(d.finish()).toBeUndefined();
  });
});

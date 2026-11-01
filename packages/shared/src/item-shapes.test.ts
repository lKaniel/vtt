import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { dragHandle, handlesOf, MODES, moveBy, shapeOf, snapDelta, type View } from './placeables.ts';

const view: View = { gridSize: 100, px: 1 };
const doc = (type: string, extra: Record<string, unknown>): Doc => ({ id: 'x', type, rev: 1, ...extra });
const snap = { gridSize: 100, free: false };

const box = doc('drawing', { shape: 'rect', x: 0, y: 0, w: 200, h: 100 });
const poly = doc('drawing', {
  shape: 'polygon',
  points: [
    [0, 0],
    [200, 0],
    [100, 200],
  ],
});
const scribble = doc('drawing', {
  shape: 'freehand',
  points: [
    [0, 0],
    [100, 50],
    [200, 100],
  ],
});
const note = doc('note', { x: 150, y: 150 });
const cone = doc('template', { shape: 'cone', x: 0, y: 0, distance: 15, direction: 0 });
const region = doc('region', {
  points: [
    [0, 0],
    [300, 0],
    [300, 300],
  ],
  behaviors: [],
});
const sound = doc('sound', { x: 100, y: 100, radius: 20, src: 'a.ogg' });

describe('the new editor modes', () => {
  it('edit their own collections', () => {
    expect(MODES.drawings).toEqual({ coll: 'drawings', type: 'drawing' });
    expect(MODES.notes).toEqual({ coll: 'notes', type: 'note' });
    expect(MODES.templates).toEqual({ coll: 'templates', type: 'template' });
    expect(MODES.regions).toEqual({ coll: 'regions', type: 'region' });
    expect(MODES.sounds).toEqual({ coll: 'sounds', type: 'sound' });
  });

  it('snap notes, sounds and templates to half squares, the rest to squares', () => {
    expect(snapDelta([140, 60], 'notes', 100, false)).toEqual([150, 50]);
    expect(snapDelta([140, 60], 'templates', 100, false)).toEqual([150, 50]);
    expect(snapDelta([140, 60], 'regions', 100, false)).toEqual([100, 100]);
  });
});

describe('shapes', () => {
  it('pick boxes as boxes, polygons and regions by their inside, lines by their strokes', () => {
    expect(shapeOf(box, view)).toEqual({ kind: 'rect', x: 0, y: 0, w: 200, h: 100 });
    expect(shapeOf(poly, view).kind).toBe('polygon');
    expect(shapeOf(scribble, view).kind).toBe('path');
    expect(shapeOf(region, view).kind).toBe('polygon');
    expect(shapeOf(cone, view).kind).toBe('polygon');
  });

  it('pick notes and sounds by their pins, the same size on screen at any zoom', () => {
    expect(shapeOf(note, { gridSize: 100, px: 2 })).toEqual({ kind: 'circle', c: [150, 150], r: 28 });
    expect(shapeOf(sound, view)).toEqual({ kind: 'circle', c: [100, 100], r: 12 });
  });
});

describe('moves', () => {
  it('move boxes by x and y, and point runs point by point', () => {
    expect(moveBy(box, [100, 0])).toEqual({ x: 100 });
    expect(moveBy(region, [0, 100])).toEqual({
      points: [
        [0, 100],
        [300, 100],
        [300, 400],
      ],
    });
    expect(moveBy(note, [50, 50])).toEqual({ x: 200, y: 200 });
  });
});

describe('handles', () => {
  it('resize boxes from 8 handles, like tiles', () => {
    expect(handlesOf(box, view)).toHaveLength(8);
    expect(dragHandle(box, 'se', [310, 290], snap)).toEqual({ x: 0, y: 0, w: 300, h: 300 });
  });

  it('move a polygon point, or put in a new one from a side middle', () => {
    expect(handlesOf(poly, view).map((h) => h.id)).toEqual(['p0', 'p1', 'p2', 'm0', 'm1', 'm2']);
    expect(dragHandle(poly, 'p2', [110, 290], snap)).toEqual({
      points: [
        [0, 0],
        [200, 0],
        [100, 300],
      ],
    });
    expect(dragHandle(region, 'm0', [150, -90], snap)).toEqual({
      points: [
        [0, 0],
        [200, -100],
        [300, 0],
        [300, 300],
      ],
    });
  });

  it('scale freehand lines by their box', () => {
    expect(handlesOf(scribble, view).map((h) => h.id)).toContain('se');
    expect(dragHandle(scribble, 'se', [400, 200], snap)).toEqual({
      points: [
        [0, 0],
        [200, 100],
        [400, 200],
      ],
    });
  });

  it('aim templates from their end', () => {
    expect(handlesOf(cone, view)).toEqual([{ id: 'aim', at: [300, 0] }]);
    expect(dragHandle(cone, 'aim', [0, 400], snap)).toEqual({ distance: 20, direction: 90 });
  });

  it('stretch a sound to the ring of its radius, and give notes none', () => {
    expect(handlesOf(sound, view)).toEqual([{ id: 'radius', at: [500, 100] }]);
    expect(dragHandle(sound, 'radius', [100, 720], snap)).toEqual({ radius: 30 });
    expect(handlesOf(note, view)).toEqual([]);
  });
});

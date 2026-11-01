import { describe, expect, it } from 'vitest';
import {
  distanceTo,
  hitTest,
  marqueeHits,
  nearestOnSegment,
  rectBetween,
  shapeBounds,
  type Hittable,
} from './hit-test.ts';

const wall: Hittable = { key: 'wall', shape: { kind: 'segment', a: [0, 0], b: [400, 0] } };
const light: Hittable = { key: 'light', shape: { kind: 'circle', c: [200, 0], r: 10 } };
const tile: Hittable = { key: 'tile', shape: { kind: 'rect', x: 100, y: 100, w: 200, h: 100 } };

describe('distanceTo', () => {
  it('is 0 inside a shape and the gap outside it', () => {
    expect(distanceTo(tile.shape, [150, 150])).toBe(0);
    expect(distanceTo(tile.shape, [350, 150])).toBe(50);
    expect(distanceTo(light.shape, [200, 30])).toBe(20);
    expect(distanceTo(wall.shape, [100, 12])).toBe(12);
    expect(distanceTo(wall.shape, [430, 40])).toBe(50);
  });
});

describe('nearestOnSegment', () => {
  it('clamps to the ends', () => {
    expect(nearestOnSegment([-50, 5], [0, 0], [100, 0])).toEqual([0, 0]);
    expect(nearestOnSegment([40, 5], [0, 0], [100, 0])).toEqual([40, 0]);
  });
});

describe('hitTest', () => {
  it('picks the topmost item within reach: later items sit on top', () => {
    expect(hitTest([wall, light], [200, 5], 8)).toBe('light');
    expect(hitTest([light, wall], [200, 5], 8)).toBe('wall');
    expect(hitTest([wall, light], [50, 6], 8)).toBe('wall');
    expect(hitTest([wall, light], [50, 60], 8)).toBeUndefined();
  });
});

describe('marqueeHits', () => {
  const box = rectBetween([250, -20], [150, 20]);

  it('normalises the dragged rectangle', () => {
    expect(box).toEqual({ x: 150, y: -20, w: 100, h: 40 });
  });

  it('takes everything the rectangle touches, or only what it holds whole', () => {
    expect(marqueeHits([wall, light, tile], box, 'touch')).toEqual(['wall', 'light']);
    expect(marqueeHits([wall, light, tile], box, 'contain')).toEqual(['light']);
    expect(marqueeHits([tile], rectBetween([0, 0], [500, 500]), 'contain')).toEqual(['tile']);
  });

  it('catches a wall that crosses the rectangle without an end inside it', () => {
    const diagonal: Hittable = { key: 'd', shape: { kind: 'segment', a: [0, 0], b: [100, 100] } };
    expect(marqueeHits([diagonal], { x: 40, y: 40, w: 20, h: 20 }, 'touch')).toEqual(['d']);
    expect(marqueeHits([diagonal], { x: 60, y: 0, w: 20, h: 20 }, 'touch')).toEqual([]);
  });

  it('catches a circle overlapping a corner', () => {
    const round: Hittable = { key: 'r', shape: { kind: 'circle', c: [0, 0], r: 10 } };
    expect(marqueeHits([round], { x: 5, y: 5, w: 10, h: 10 }, 'touch')).toEqual(['r']);
    expect(marqueeHits([round], { x: 8, y: 8, w: 10, h: 10 }, 'touch')).toEqual([]);
  });
});

describe('shapeBounds', () => {
  it('boxes every kind of shape', () => {
    expect(shapeBounds(wall.shape)).toEqual({ x: 0, y: 0, w: 400, h: 0 });
    expect(shapeBounds(light.shape)).toEqual({ x: 190, y: -10, w: 20, h: 20 });
    expect(shapeBounds(tile.shape)).toEqual({ x: 100, y: 100, w: 200, h: 100 });
  });
});

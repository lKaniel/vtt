import type { Doc } from '@vtt/core';
import { applyPatch, dragHandle, handlesOf, MODES, moveBy, shapeOf, snapDelta, type View } from './placeables.ts';
import { describe, expect, it } from 'vitest';

const view: View = { gridSize: 100, px: 1 };
const wall: Doc = { id: 'w', type: 'wall', rev: 1, a: [0, 0], b: [200, 0] };
const light: Doc = { id: 'l', type: 'light', rev: 1, x: 100, y: 100, bright: 20, dim: 20 };
const tile: Doc = { id: 't', type: 'tile', rev: 1, kind: 'rect', x: 0, y: 0, w: 200, h: 100, color: '#000' };
const token: Doc = { id: 'k', type: 'token', rev: 1, x: 50, y: 50, size: 2 };

describe('editor modes', () => {
  it('each mode edits one collection of the scene', () => {
    expect(MODES.walls).toEqual({ coll: 'walls', type: 'wall' });
    expect(MODES.tokens.coll).toBe('tokens');
  });
});

describe('shapeOf', () => {
  it('turns each kind into a shape the hit test understands', () => {
    expect(shapeOf(wall, view)).toEqual({ kind: 'segment', a: [0, 0], b: [200, 0] });
    expect(shapeOf(tile, view)).toEqual({ kind: 'rect', x: 0, y: 0, w: 200, h: 100 });
    expect(shapeOf(light, { gridSize: 100, px: 2 })).toEqual({ kind: 'circle', c: [100, 100], r: 24 });
    expect(shapeOf(token, view)).toEqual({ kind: 'circle', c: [50, 50], r: 84 });
  });
});

describe('moveBy', () => {
  it('moves each kind as a patch of the fields that changed', () => {
    expect(moveBy(wall, [100, 0])).toEqual({ a: [100, 0], b: [300, 0] });
    expect(moveBy(light, [0, 50])).toEqual({ y: 150 });
    expect(moveBy(tile, [-100, 0])).toEqual({ x: -100 });
  });
});

describe('snapDelta', () => {
  it('moves by whole squares (lights by half squares) unless free', () => {
    expect(snapDelta([140, -60], 'walls', 100, false)).toEqual([100, -100]);
    expect(snapDelta([140, -60], 'lights', 100, false)).toEqual([150, -50]);
    expect(snapDelta([140.4, -60.6], 'tiles', 100, true)).toEqual([140, -61]);
  });
});

describe('handles', () => {
  it('walls have their two ends', () => {
    expect(handlesOf(wall, view)).toEqual([
      { id: 'a', at: [0, 0] },
      { id: 'b', at: [200, 0] },
    ]);
  });

  it('lights have a bright and a dim ring', () => {
    const [bright, dim] = handlesOf(light, view);
    expect(bright).toEqual({ id: 'bright', at: [500, 100] });
    expect(dim?.id).toBe('dim');
    expect(Math.hypot(dim!.at[0] - 100, dim!.at[1] - 100)).toBeCloseTo(800);
  });

  it('tiles have eight resize handles; tokens none', () => {
    expect(handlesOf(tile, view).map((h) => h.id)).toEqual(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']);
    expect(handlesOf(tile, view).find((h) => h.id === 'se')?.at).toEqual([200, 100]);
    expect(handlesOf(token, view)).toEqual([]);
  });
});

describe('dragHandle', () => {
  const snap = { gridSize: 100, free: false };

  it('moves a wall end to the nearest corner, never onto the other end', () => {
    expect(dragHandle(wall, 'b', [290, 130], snap)).toEqual({ b: [300, 100] });
    expect(dragHandle(wall, 'a', [190, 10], snap)).toEqual({});
  });

  it('sets a light radius in 5 ft steps, keeping the outer edge when bright moves', () => {
    expect(dragHandle(light, 'bright', [380, 100], snap)).toEqual({ bright: 15, dim: 25 });
    expect(dragHandle(light, 'dim', [100, 700], snap)).toEqual({ dim: 10 });
    expect(dragHandle(light, 'dim', [100, 150], snap)).toEqual({ dim: 0 });
    expect(dragHandle(light, 'bright', [100, 1000], snap)).toEqual({ bright: 45, dim: 0 });
  });

  it('resizes a tile from an edge or a corner, never below one square', () => {
    expect(dragHandle(tile, 'se', [310, 260], snap)).toEqual({ x: 0, y: 0, w: 300, h: 300 });
    expect(dragHandle(tile, 'w', [-90, 50], snap)).toEqual({ x: -100, y: 0, w: 300, h: 100 });
    expect(dragHandle(tile, 'n', [0, 400], snap)).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(dragHandle(tile, 'e', [233, 0], { gridSize: 100, free: true })).toEqual({ x: 0, y: 0, w: 233, h: 100 });
  });

  it('ignores handles a kind does not have', () => {
    expect(dragHandle(token, 'n', [0, 0], snap)).toEqual({});
  });
});

describe('applyPatch', () => {
  it('sets fields and removes the null ones', () => {
    expect(applyPatch(light, { dim: 5, color: null })).toEqual({ ...light, dim: 5 });
    expect(applyPatch({ ...light, color: '#fff' }, { color: null })).toEqual(light);
  });
});

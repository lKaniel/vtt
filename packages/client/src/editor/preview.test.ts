import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { previewDoc } from './preview.ts';

const wall: Doc = { id: 'w', type: 'wall', rev: 1, a: [0, 0], b: [200, 0] };
const ctx = { mode: 'walls' as const, gridSize: 100 };

describe('previewDoc', () => {
  it('shows a dragged selection where it would land, snapped', () => {
    const preview = { kind: 'move' as const, keys: ['s/walls#w'], delta: [130, 0] as [number, number], free: false };
    expect(previewDoc('s/walls#w', wall, preview, ctx)).toMatchObject({ a: [100, 0], b: [300, 0] });
    expect(previewDoc('s/walls#x', wall, preview, ctx)).toBe(wall);
  });

  it('shows a dragged handle where it would land', () => {
    const preview = {
      kind: 'handle' as const,
      key: 's/walls#w',
      handle: 'b',
      to: [190, 110] as [number, number],
      free: false,
    };
    expect(previewDoc('s/walls#w', wall, preview, ctx)).toMatchObject({ a: [0, 0], b: [200, 100] });
  });

  it('leaves documents alone without a drag', () => {
    expect(previewDoc('s/walls#w', wall, undefined, ctx)).toBe(wall);
    expect(previewDoc('s/walls#w', wall, { kind: 'marquee', rect: { x: 0, y: 0, w: 1, h: 1 } }, ctx)).toBe(wall);
  });
});

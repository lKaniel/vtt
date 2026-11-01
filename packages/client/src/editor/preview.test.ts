import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { previewDoc, previewTiles } from './preview.ts';

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

describe('previewTiles', () => {
  const tiles: Doc[] = [
    { id: 'g', type: 'tile', rev: 1, kind: 'group' },
    { id: 'a', type: 'tile', rev: 1, kind: 'rect', x: 0, y: 0, w: 100, h: 100, parent: 'g' },
    { id: 'b', type: 'tile', rev: 1, kind: 'rect', x: 100, y: 0, w: 100, h: 100, parent: 'g' },
  ];
  const tctx = { mode: 'tiles' as const, gridSize: 100 };
  const byId = (docs: Doc[]) => Object.fromEntries(docs.map((d) => [d.id, d]));

  it('moves what is in a dragged group, and the group spans it', () => {
    const preview = { kind: 'move' as const, keys: ['s/tiles#g'], delta: [100, 0] as [number, number], free: false };
    const shown = byId(previewTiles(tiles, 's/tiles', preview, tctx));
    expect(shown.b).toMatchObject({ x: 200 });
    expect(shown.g).toMatchObject({ x: 100, y: 0, w: 200, h: 100 });
  });

  it('scales what is in a group whose handle is dragged', () => {
    const preview = {
      kind: 'handle' as const,
      key: 's/tiles#g',
      handle: 'e',
      to: [400, 50] as [number, number],
      free: false,
    };
    expect(byId(previewTiles(tiles, 's/tiles', preview, tctx)).b).toMatchObject({ x: 200, w: 200 });
  });
});

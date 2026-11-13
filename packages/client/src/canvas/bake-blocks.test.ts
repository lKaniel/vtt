import type { BakeGroup } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { blocksToShow } from './bake-blocks.ts';

// Which blocks of a floor's picture pyramid the map shows: those of the zoom
// the screen needs over the view, and while one loads, the nearest coarser
// block already in (the whole floor's block at worst).

const group: BakeGroup = {
  x: 0,
  y: 0,
  w: 2048,
  h: 1024,
  zooms: 3,
  tiles: {},
  blocks: [['0_0', '1_0', '2_0', '3_0', '0_1', '1_1'], ['0_0', '1_0'], ['0_0']],
};
const view = { x: 0, y: 0, w: 1000, h: 400 };

describe('blocks to show', () => {
  it('asks for the zoom’s blocks over the view that have anything in them', () => {
    const { want } = blocksToShow(group, { scale: 1, screenPerMap: 1, view }, () => false);
    expect(want).toEqual(['0/0_0', '0/1_0', '2/0_0']);
  });

  it('shows the loaded ones, and a coarser block where one is still loading', () => {
    const loaded = new Set(['0/0_0', '2/0_0']);
    const { show } = blocksToShow(group, { scale: 1, screenPerMap: 1, view }, (key) => loaded.has(key));
    expect(show).toEqual(['2/0_0', '0/0_0']);
  });

  it('picks a coarser zoom when zoomed out', () => {
    const { want } = blocksToShow(
      group,
      { scale: 1, screenPerMap: 0.3, view: { x: 0, y: 0, w: 2048, h: 1024 } },
      () => false,
    );
    expect(want).toEqual(['1/0_0', '1/1_0', '2/0_0']);
  });
});

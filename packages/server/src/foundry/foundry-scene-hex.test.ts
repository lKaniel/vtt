import { describe, expect, it } from 'vitest';
import { foundryScene } from './foundry-scene.ts';

// Foundry's hex grids: 2 and 3 are rows of pointy hexes (odd or even rows
// shifted), 4 and 5 columns of flat ones. A 4000 x 3000 px scene, 200 px
// hexes, 25% padding.

const media = (path: string) => `pack://maps/${path}`;
const scene = (type: number) => ({
  _id: 'h',
  name: 'Hexes',
  width: 4000,
  height: 3000,
  padding: 0.25,
  background: { src: 'm.webp' },
  grid: { size: 200, type, distance: 5 },
});

describe('a Foundry hex scene', () => {
  it('keeps a hex grid, padded the way Foundry pads one', () => {
    const rows = foundryScene(scene(2), media);
    expect(rows.scene.grid).toBe('hex-rows');
    // Rows of pointy hexes 231 px tall: four of them down, five hexes across.
    expect(rows.scene.tiles[0]).toMatchObject({ x: 1000, y: 924 });
    expect(rows.skipped.map((l) => l.what)).not.toContainEqual(expect.stringMatching(/^Hex/));
    const cols = foundryScene(scene(5), media);
    expect(cols.scene.grid).toBe('hex-cols');
    expect(cols.scene.tiles[0]).toMatchObject({ x: 1155, y: 800 });
    expect(cols.skipped.map((l) => l.what)).toContain(
      'Hex grid offset (even columns shifted): the grid sits half a hex off',
    );
  });
});

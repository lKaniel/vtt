import { describe, expect, it } from 'vitest';
import { latticeOf } from './grid.ts';
import { templateCells } from './templates.ts';

// On hexes a template covers whole hexes, the ones whose centre it takes in
// (as Foundry highlights them).

describe('templates on hexes', () => {
  const hex = latticeOf('hex-rows', 100);
  const [x, y] = hex.centre([4, 4]);
  const template = (shape: 'circle' | 'cone', distance: number) => ({
    id: 't',
    type: 'template' as const,
    x,
    y,
    shape,
    distance,
  });

  it('cover a hex and the ring around it for a 5 ft circle', () => {
    expect(templateCells(template('circle', 5), hex)).toHaveLength(7);
  });

  it('cover the hexes a cone reaches, not the one it starts from', () => {
    const cells = templateCells({ ...template('cone', 15), direction: 0 }, hex);
    expect(cells).toContainEqual([7, 4]);
    expect(cells).not.toContainEqual([3, 4]);
  });
});

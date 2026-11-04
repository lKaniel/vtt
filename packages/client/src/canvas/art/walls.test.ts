import { describe, expect, it } from 'vitest';
import { doorLeaf, wallsDrawn } from './walls.ts';

describe('doorLeaf', () => {
  it('fills the doorway when closed', () => {
    const leaf = doorLeaf([0, 0], [100, 0], false);
    const xs = leaf.filter((_, i) => i % 2 === 0);
    const ys = leaf.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(100);
    expect(Math.max(...ys.map(Math.abs))).toBeLessThan(10);
  });

  it('swings out from the hinge at the first end when open', () => {
    const leaf = doorLeaf([0, 0], [100, 0], true);
    const xs = leaf.filter((_, i) => i % 2 === 0);
    const ys = leaf.filter((_, i) => i % 2 === 1);
    expect(Math.max(...xs)).toBeLessThan(25);
    expect(Math.max(...ys.map(Math.abs))).toBeGreaterThan(90);
  });
});

describe('wallsDrawn', () => {
  const walls = [
    { id: 'w', a: [0, 0] as [number, number], b: [100, 0] as [number, number] },
    { id: 'd', a: [0, 0] as [number, number], b: [0, 100] as [number, number], door: 'closed' as const },
  ];

  it('draws none on a map whose picture shows its walls: they only block', () => {
    expect(wallsDrawn(walls, {})).toEqual([]);
  });

  it('draws them all on a scene that asks for wall art (a map made of plain tiles)', () => {
    expect(wallsDrawn(walls, { wallArt: true })).toEqual(walls);
  });
});

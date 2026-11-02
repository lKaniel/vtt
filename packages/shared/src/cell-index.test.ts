import { describe, expect, it } from 'vitest';
import { CellIndex } from './cell-index.ts';

describe('CellIndex', () => {
  const index = new CellIndex<string>(100);
  index.add('near', [10, 10], [20, 20]);
  index.add('far', [910, 910], [920, 920]);
  index.add('wide', [0, 450], [1000, 460]);

  const along = (a: [number, number], b: [number, number]) => {
    const found: string[] = [];
    index.someAlong(a, b, (item) => (found.push(item), false));
    return found.sort((x, y) => x.localeCompare(y));
  };

  it('finds only what is filed in the cells a line crosses', () => {
    expect(along([0, 0], [50, 50])).toEqual(['near']);
    expect(along([0, 0], [990, 990])).toEqual(['far', 'near', 'wide']);
    expect(along([500, 0], [500, 300])).toEqual([]);
  });

  it('tries each item once, however many cells it spans', () => {
    expect(along([0, 455], [1000, 455])).toEqual(['wide']);
  });

  it('stops at the first item that passes the test', () => {
    expect(index.someAlong([0, 0], [990, 990], (item) => item === 'near')).toBe(true);
    expect(index.someAlong([500, 0], [500, 300], () => true)).toBe(false);
  });
});

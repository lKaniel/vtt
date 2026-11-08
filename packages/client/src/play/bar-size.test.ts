import { describe, expect, it } from 'vitest';
import { barRow, barRows, defaultBarSize, ROW_TILES } from './bar-size.ts';

describe('compact action bar rows', () => {
  const slots = Array.from({ length: 30 }, (_, i) => i);

  it('cuts the slots into rows of ten', () => {
    expect(ROW_TILES).toBe(10);
    expect(barRows(slots.length)).toBe(3);
    expect(barRow(slots, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(barRow(slots, 2)).toEqual([20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  });

  it('keeps at least one row and wraps a row past the end back to the first', () => {
    expect(barRows(0)).toBe(1);
    expect(barRows(11)).toBe(2);
    expect(barRow(slots, 3)).toEqual(barRow(slots, 0));
    expect(barRow(slots, -1)).toEqual(barRow(slots, 2));
  });

  it('pads a short last row so the bar keeps its width', () => {
    expect(barRow([1, 2, 3], 0)).toEqual([1, 2, 3, null, null, null, null, null, null, null]);
  });
});

describe('default bar size', () => {
  it('is compact on a short screen and full on a tall one', () => {
    expect(defaultBarSize(640)).toBe('compact');
    expect(defaultBarSize(719)).toBe('compact');
    expect(defaultBarSize(768)).toBe('full');
  });
});

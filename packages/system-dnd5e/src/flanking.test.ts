import { describe, expect, it } from 'vitest';
import { flanks } from './flanking.ts';

const at = (x: number, y: number, size = 1) => ({ x, y, size });

describe('flanking (optional rule)', () => {
  const target = at(150, 150);

  it('an ally on the opposite side flanks', () => {
    expect(flanks(at(50, 150), at(250, 150), target)).toBe(true);
    expect(flanks(at(50, 50), at(250, 250), target)).toBe(true);
  });

  it('an ally beside or at a knight-move angle does not', () => {
    expect(flanks(at(50, 150), at(150, 50), target)).toBe(false);
    expect(flanks(at(50, 150), at(250, 250), target)).toBe(false);
    expect(flanks(at(50, 150), at(50, 250), target)).toBe(false);
  });
});

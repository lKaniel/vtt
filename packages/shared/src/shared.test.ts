import { describe, expect, it } from 'vitest';
import { chunksInRect, diceFormula, findPath, roll, segmentsIntersect, type Wall } from './index.ts';

const G = 100;

describe('segmentsIntersect', () => {
  it('detects crossing and touching', () => {
    expect(segmentsIntersect([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true);
    expect(segmentsIntersect([0, 0], [10, 0], [10, 0], [10, 10])).toBe(true);
    expect(segmentsIntersect([0, 0], [10, 0], [0, 1], [10, 1])).toBe(false);
  });
});

describe('findPath', () => {
  it('walks straight on open ground', () => {
    const p = findPath([50, 50], [550, 50], [], { gridSize: G })!;
    expect(p.feet).toBe(25);
    expect(p.points.at(-1)).toEqual([550, 50]);
  });

  it('counts diagonals as 5 ft', () => {
    expect(findPath([50, 50], [350, 350], [], { gridSize: G })!.feet).toBe(15);
  });

  it('goes around a wall', () => {
    const wall: Wall = { id: 'w', a: [300, -200], b: [300, 300] };
    const p = findPath([50, 50], [550, 50], [wall], { gridSize: G })!;
    expect(p.feet).toBeGreaterThan(25);
    for (let i = 1; i < p.points.length; i++) {
      expect(segmentsIntersect(p.points[i - 1]!, p.points[i]!, wall.a, wall.b)).toBe(false);
    }
  });

  it('passes open doors but not closed ones', () => {
    const box: Wall[] = [
      { id: 'n', a: [0, 0], b: [300, 0] },
      { id: 'w', a: [0, 0], b: [0, 300] },
      { id: 's', a: [0, 300], b: [300, 300] },
      { id: 'e', a: [300, 0], b: [300, 300], door: 'closed' },
    ];
    expect(findPath([150, 150], [550, 150], box, { gridSize: G, margin: 4 })).toBeNull();
    box[3]!.door = 'open';
    expect(findPath([150, 150], [550, 150], box, { gridSize: G, margin: 4 })!.feet).toBe(20);
  });
});

describe('roll', () => {
  const seq =
    (...v: number[]) =>
    () =>
      (v.shift()! - 0.5) / 20;
  it('adds dice and modifiers', () => {
    const r = roll('1d20 + 5', seq(12));
    expect(r.total).toBe(17);
  });
  it('keeps the highest for advantage', () => {
    const r = roll('2d20kh1', seq(4, 15));
    expect(r.total).toBe(15);
    expect(r.terms[0]!.kept).toEqual([false, true]);
  });
  it('rejects junk', () => {
    expect(() => roll('fireball')).toThrow();
    expect(() => roll('1d20 5')).toThrow();
  });
  it('reads dice typed on a Ukrainian or Russian layout, or in capitals', () => {
    // "в" sits on the d key; "л" on k, "р" on h, "д" on l.
    expect(roll('1в10+3', seq(12)).formula).toBe('1d10+3');
    expect(roll('2В6', seq(1, 1)).total).toBe(2);
    expect(roll('1D20 + 5', seq(12)).total).toBe(17);
    expect(roll('2в20лр1', seq(4, 15)).total).toBe(15);
    expect(roll('2в20лд1', seq(4, 15)).total).toBe(4);
  });
});

describe('diceFormula', () => {
  it('tidies a formula into the form roll() writes, or says it cannot be read', () => {
    expect(diceFormula(' 1в10 + 3 ')).toBe('1d10+3');
    expect(diceFormula('1D8')).toBe('1d8');
    expect(diceFormula('5')).toBe('5');
    expect(diceFormula('fireball')).toBeUndefined();
    expect(diceFormula('')).toBeUndefined();
    expect(diceFormula('1d0')).toBeUndefined();
  });
});

describe('chunksInRect', () => {
  it('covers negative coordinates', () => {
    expect(chunksInRect({ x: -10, y: -10, w: 20, h: 20 }, 1000).sort((a, b) => a.localeCompare(b))).toEqual([
      '-1_-1',
      '-1_0',
      '0_-1',
      '0_0',
    ]);
  });
});

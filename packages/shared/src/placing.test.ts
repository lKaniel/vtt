import { describe, expect, it } from 'vitest';
import { placeToken, uniqueId, uniqueName } from './index.ts';

describe('ids and names for new tokens', () => {
  it('turns a name into a free id', () => {
    const taken = new Set(['goblin', 'goblin-2']);
    expect(uniqueId('Goblin', (id) => taken.has(id))).toBe('goblin-3');
    expect(uniqueId("Brother Orrin's Wolf!", () => false)).toBe('brother-orrin-s-wolf');
    expect(uniqueId('???', () => false)).toBe('token');
  });

  it('numbers a name that is already on the map', () => {
    expect(uniqueName('Goblin', ['Wolf'])).toBe('Goblin');
    expect(uniqueName('Goblin', ['Goblin', 'Goblin 2'])).toBe('Goblin 3');
  });
});

describe('placing tokens', () => {
  it('puts odd sizes on a square centre and even sizes on a grid corner', () => {
    expect(placeToken([130, 270], 1, 100)).toEqual([150, 250]);
    expect(placeToken([130, 270], 2, 100)).toEqual([100, 300]);
    expect(placeToken([130, 270], 3, 100)).toEqual([150, 250]);
  });
});

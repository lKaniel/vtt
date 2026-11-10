import { describe, expect, it } from 'vitest';
import { dressOf } from './token-dress.ts';

// What a creature wears on the map beyond its face: the rings of the auras it
// gives off and the looping videos of the spells and conditions on it.
// 100 px squares.

const kara = { x: 0, y: 0, size: 1, ownership: { default: 'limited' as const, ana: 'owner' as const } };

describe('a token’s dress', () => {
  it('rings an aura out from the token’s edge, gold for its allies and red for its foes', () => {
    const dress = dressOf(
      {
        ...kara,
        auras: [
          { name: 'Aura of Protection', radius: 10, who: 'allies' },
          { name: 'Hunger', radius: 5, who: 'enemies' },
        ],
      },
      100,
    );
    expect(dress.rings).toEqual([
      { r: 250, color: 0xe8c66a, name: 'Aura of Protection' },
      { r: 150, color: 0xd05040, name: 'Hunger' },
    ]);
  });

  it('lays each loop over a little more than the token', () => {
    expect(dressOf({ ...kara, size: 2, loops: ['pack://jb2a/Bless_Loop.webm'] }, 100).loops).toEqual([
      { src: 'pack://jb2a/Bless_Loop.webm', size: 300 },
    ]);
    expect(dressOf(kara, 100)).toEqual({ rings: [], loops: [] });
  });
});

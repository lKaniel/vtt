import { describe, expect, it } from 'vitest';
import { effectLoops } from './effect-loops.ts';
import { TokenSchema } from './token-schema.ts';

// A creature under a spell or a condition wears that one's looping video from
// the game's packs (JB2A's Bless loop, a poison marker), drawn under it.

const art: Record<string, string[]> = {
  'zone:bless': ['pack://jb2a/Bless_Loop.webm'],
  'zone:hex': ['pack://jb2a/Hex_Burst.webm'],
  'condition:poisoned': ['pack://jb2a/MarkerPoison_Loop.webm'],
};
const find = (key: string) => art[key];

describe('looping videos on creatures', () => {
  it('come from the spells and conditions on it, once each, only loops', () => {
    const token = TokenSchema.parse({
      id: 'h',
      name: 'Hero',
      x: 0,
      y: 0,
      effects: [
        { id: 'b', name: 'Bless', spell: 'bless' },
        { id: 'b2', name: 'Bless', spell: 'bless' },
        { id: 'x', name: 'Hex', spell: 'hex' },
        { id: 'p', name: 'Poisoned', conditions: ['poisoned'] },
      ],
    });
    expect(effectLoops(token, find)).toEqual(['pack://jb2a/Bless_Loop.webm', 'pack://jb2a/MarkerPoison_Loop.webm']);
  });

  it('are none without effects', () => {
    expect(effectLoops(TokenSchema.parse({ id: 'h', name: 'H', x: 0, y: 0 }), find)).toEqual([]);
  });
});

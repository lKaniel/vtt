import type { TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { Levels } from './session-levels.ts';

// A house with a cellar, a ground floor and an upper floor that looks down on nothing.
const levels = [
  { id: 'cellar', name: 'Cellar', bottom: -10, top: 0 },
  { id: 'ground', name: 'Ground', bottom: 0, top: 13 },
  { id: 'upper', name: 'Upper', bottom: 13, top: 26 },
];
function levelsFor(view3d: boolean, elevation = 13) {
  const bram = { id: 'bram', elevation } as TokenView;
  const host = {
    world: { levels } as never,
    selected: 'bram',
    tokens: new Map([['bram', bram]]),
    isGm: () => false,
    canControl: () => true,
    send: () => undefined,
    view3d: { on: view3d },
  };
  return new Levels(host, { editorChanged: () => undefined, changed: () => undefined });
}

describe('the floors drawn', () => {
  it('on a flat map: the floor your creature is on and those it looks down on', () => {
    expect(levelsFor(false).shown).toEqual(['upper']);
  });

  it('in 3D: the street and every floor up to yours, as the world stands under it', () => {
    expect(levelsFor(true).shown).toEqual(['ground', 'upper']);
    expect(levelsFor(true, 0).shown).toEqual(['ground']);
    expect(levelsFor(true, -10).shown).toEqual(['cellar']);
  });
});

import type { WorldInfo } from '@vtt/shared';
import type { TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { type StandContext, standingOf } from './standing3d.ts';

// The creatures standing as pictures in 3D: on their own floor, on what is
// under them, or in the air when their elevation keeps them well above it.

const world = {
  gridSize: 100,
  levels: [
    { id: 'ground', name: 'Ground', bottom: 0 },
    { id: 'loft', name: 'Loft', bottom: 10 },
  ],
} as unknown as WorldInfo;

const creature = (id: string, more: Partial<TokenView> = {}) =>
  ({ id, x: 50, y: 50, size: 1, name: id, hidden: false, ...more }) as unknown as TokenView;

function context(more: Partial<StandContext> = {}): StandContext {
  return {
    table: { world },
    floor: 0,
    px: 20,
    grid: 100,
    placeOf: () => ({ at: [50, 50] }),
    under: () => undefined,
    ...more,
  };
}

describe('the creatures standing in 3D', () => {
  it('stands a creature on the ground, as big as its squares', () => {
    const [hero] = standingOf([creature('hero', { size: 2 })], context());
    expect(hero).toMatchObject({ id: 'hero', at: [50, 50], height: 0, size: 200, faint: false });
    expect(hero!.ground).toBeUndefined();
  });

  it('keeps a flyer in the air over the ground, which its shadow marks', () => {
    const [bat] = standingOf(
      [creature('bat', { elevation: 30 })],
      context({ table: { world: { gridSize: 100 } as WorldInfo } }),
    );
    expect(bat).toMatchObject({ height: 600, ground: 0 });
    // With floors, the shadow falls on the floor its height is on.
    const [owl] = standingOf([creature('owl', { elevation: 30 })], context());
    expect(owl).toMatchObject({ height: 600, ground: 200 });
  });

  it('stands a creature on the surface under it, and on its own floor when nothing is there', () => {
    const onBridge = standingOf([creature('hero', { elevation: 10 })], context({ under: () => 190 }));
    expect(onBridge[0]).toMatchObject({ height: 190 });
    const upstairs = standingOf([creature('cat', { elevation: 10 })], context({ floor: 200 }));
    expect(upstairs[0]).toMatchObject({ height: 0 });
    expect(upstairs[0]!.ground).toBeUndefined();
  });

  it('leaves out creatures the map has no place for and those standing as a figure', () => {
    const figure = creature('statue', { model: { src: 'statue.glb' } });
    expect(
      standingOf(
        [figure, creature('ghost')],
        context({ placeOf: (id) => (id === 'ghost' ? undefined : { at: [0, 0] }) }),
      ),
    ).toEqual([]);
  });
});

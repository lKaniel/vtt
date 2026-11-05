import { describe, expect, it } from 'vitest';
import { GroundFeed } from './ground-feed.ts';
import type { PixiBridge } from './pixi-bridge.ts';
import type { Ground } from './scene3d.ts';

// The ground picture and when the 3D view draws: a still view is drawn only
// a few times a second; anything that changes draws it at once.

const feed = () => {
  const asks: string[] = [];
  const bridge = {
    takeDrawn: () => false,
    frame: () => asks.push('frame'),
    redraw: () => asks.push('redraw'),
  } as unknown as PixiBridge;
  const f = new GroundFeed(bridge, {} as Ground, { refresh: 10, idleFps: 10 });
  return { f, asks };
};

describe('when the 3D view draws', () => {
  it('draws the first frame, then a still view only idleFps times a second', () => {
    const { f } = feed();
    expect(f.due('a', 0.016)).toBe(true);
    expect(f.due('a', 0.016)).toBe(false);
    expect(f.due('a', 0.1)).toBe(true);
  });

  it('draws at once when the view moves, or something pokes it', () => {
    const { f } = feed();
    f.due('a', 0.016);
    expect(f.due('b', 0.016)).toBe(true);
    f.poke();
    expect(f.due('b', 0.016)).toBe(true);
    f.walkers([[1, 2]]);
    expect(f.due('b', 0.016)).toBe(true);
    f.walkers([[1, 2]]);
    expect(f.due('b', 0.016)).toBe(false);
  });

  it('asks the 2D map for a square once, then again only when poked', () => {
    const { f, asks } = feed();
    const need = { center: [0, 0] as [number, number], half: 100 };
    f.ask(need);
    f.ask(need);
    expect(asks).toEqual(['frame']);
    f.poke();
    f.ask(need);
    expect(asks).toEqual(['frame', 'redraw']);
  });

  it('draws the 3D view at once when the pointer moves, but the ground at most HOVER_FPS times a second', () => {
    const { f, asks } = feed();
    const need = { center: [0, 0] as [number, number], half: 100 };
    f.due('a', 0.016);
    f.ask(need);
    f.lay(0.016, 0);
    f.hover();
    expect(f.due('a', 0.016)).toBe(true);
    f.ask(need);
    expect(asks).toEqual(['frame']);
    f.lay(1 / 8, 0);
    f.hover();
    f.ask(need);
    expect(asks).toEqual(['frame', 'redraw']);
  });
});

import { describe, expect, it } from 'vitest';
import { easeAlpha, roofAlpha, roofsOver, roofWatchers, scrollOffset, tileMedia } from './tile-motion.ts';

const roof = { x: 0, y: 0, w: 400, h: 300, overhead: true };

describe('tile media', () => {
  it('tells videos and animated pictures from still ones', () => {
    expect(tileMedia('maps/river.webm')).toBe('video');
    expect(tileMedia('pack://fx/portal.MP4?v=2')).toBe('video');
    expect(tileMedia('fire.gif')).toBe('gif');
    expect(tileMedia('house.webp')).toBe('image');
  });
});

describe('roofs', () => {
  it('fade out while one of your creatures stands under them', () => {
    expect(roofAlpha(roof, [[1000, 1000]])).toBe(1);
    expect(roofAlpha(roof, [[200, 150]])).toBe(0);
    expect(
      roofAlpha({ ...roof, occludedAlpha: 0.4 }, [
        [1000, 1000],
        [10, 10],
      ]),
    ).toBeCloseTo(0.4);
  });

  it('fade smoothly rather than blinking', () => {
    expect(easeAlpha(1, 0, 0.1)).toBeCloseTo(0.6);
    expect(easeAlpha(0.1, 0, 0.1)).toBe(0);
    expect(easeAlpha(0.5, 1, 1)).toBe(1);
  });

  it('watch your creatures, or for the GM the selected ones', () => {
    const places = new Map([
      ['a', [10, 10]],
      ['b', [20, 20]],
    ] as const);
    const placeOf = (id: string) => places.get(id as 'a') && { at: [...places.get(id as 'a')!] as [number, number] };
    expect(roofWatchers({ gm: false, yours: ['a', 'zz'], selected: ['b'] }, placeOf)).toEqual([[10, 10]]);
    expect(roofWatchers({ gm: true, yours: [], selected: ['b'] }, placeOf)).toEqual([[20, 20]]);
  });

  it("fade under the GM's pointer while nothing is selected, and never for players", () => {
    const placeOf = () => ({ at: [20, 20] as [number, number] });
    expect(roofWatchers({ gm: true, yours: [], selected: [], pointer: [5, 6] }, placeOf)).toEqual([[5, 6]]);
    expect(roofWatchers({ gm: true, yours: [], selected: ['b'], pointer: [5, 6] }, placeOf)).toEqual([[20, 20]]);
    expect(roofWatchers({ gm: false, yours: [], selected: [], pointer: [5, 6] }, placeOf)).toEqual([]);
  });
});

describe('scrolling tiles', () => {
  it('slide their picture round and round', () => {
    expect(scrollOffset({ x: 50, y: -20 }, 3, 100, 100)).toEqual([50, 40]);
    expect(scrollOffset({ x: 0, y: 0 }, 3, 100, 100)).toEqual([0, 0]);
  });
});

describe('roofs over a building', () => {
  const house = { x: 0, y: 0, w: 1000, h: 800 };
  const flag = { x: 100, y: 100, w: 100, h: 100 };
  const tree = { x: 900, y: 700, w: 400, h: 400 };

  it('fade together: what lies on a roof you stand under goes with it', () => {
    const covers = roofsOver([house, flag, tree], [[600, 400]]);
    expect(covers).toEqual([house]);
    expect(roofAlpha(flag, [[600, 400]], covers)).toBe(0);
    // A tree only partly over the house stays.
    expect(roofAlpha(tree, [[600, 400]], covers)).toBe(1);
  });
});

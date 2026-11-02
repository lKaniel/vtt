import { describe, expect, it } from 'vitest';
import { easeAlpha, roofAlpha, roofWatchers, scrollOffset, tileMedia } from './tile-motion.ts';

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
});

describe('scrolling tiles', () => {
  it('slide their picture round and round', () => {
    expect(scrollOffset({ x: 50, y: -20 }, 3, 100, 100)).toEqual([50, 40]);
    expect(scrollOffset({ x: 0, y: 0 }, 3, 100, 100)).toEqual([0, 0]);
  });
});

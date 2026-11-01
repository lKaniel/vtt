import { describe, expect, it } from 'vitest';
import { activeAt, levelAt, onLevel, tokenLevel } from './levels.ts';
import { inRegion, regionCost, regionsEntered } from './regions.ts';
import { soundVolume } from './sounds.ts';
import { aimTemplate, inTemplate, templateEnd, templateShape } from './templates.ts';
import type { Region, Template } from './scene-items.ts';
import type { Wall } from './schema.ts';
import { findPath } from './pathfinding.ts';

const G = 100;
const LEVELS = [
  { id: 'cellar', name: 'Cellar', bottom: -10 },
  { id: 'ground', name: 'Ground', bottom: 0 },
  { id: 'upper', name: 'Upper floor', bottom: 10 },
];

describe('levels', () => {
  it('put an elevation on the highest level it reaches', () => {
    expect(levelAt(LEVELS, 0)?.id).toBe('ground');
    expect(levelAt(LEVELS, 9)?.id).toBe('ground');
    expect(levelAt(LEVELS, 15)?.id).toBe('upper');
    expect(levelAt(LEVELS, -5)?.id).toBe('cellar');
    // Below every level: the lowest one.
    expect(levelAt(LEVELS, -50)?.id).toBe('cellar');
    expect(levelAt([], 10)).toBeUndefined();
  });

  it('read the levels in any order', () => {
    expect(levelAt([...LEVELS].reverse(), 12)?.id).toBe('upper');
  });

  it('show things on every level when they name none, or when the scene has no levels', () => {
    expect(onLevel({}, 'upper')).toBe(true);
    expect(onLevel({ level: 'upper' }, 'upper')).toBe(true);
    expect(onLevel({ level: 'cellar' }, 'upper')).toBe(false);
    expect(onLevel({ level: 'cellar' }, undefined)).toBe(true);
  });

  it('place a token by its elevation, on the ground level when it has none', () => {
    expect(tokenLevel(LEVELS, { elevation: 12 })).toBe('upper');
    expect(tokenLevel(LEVELS, {})).toBe('ground');
    expect(tokenLevel(undefined, { elevation: 12 })).toBeUndefined();
  });

  it('switch things on by the darkness band they work in', () => {
    expect(activeAt(undefined, 0.2)).toBe(true);
    expect(activeAt([0.6, 1], 0.2)).toBe(false);
    expect(activeAt([0.6, 1], 0.8)).toBe(true);
    // A band that wraps: dusk to dawn written high to low.
    expect(activeAt([0.8, 0.2], 0.9)).toBe(true);
    expect(activeAt([0.8, 0.2], 0.5)).toBe(false);
  });
});

const tpl = (t: Partial<Template>): Template => ({ id: 't', shape: 'circle', x: 500, y: 500, distance: 10, ...t });

describe('templates', () => {
  it('cover a circle of their radius', () => {
    const t = tpl({ distance: 10 });
    expect(templateShape(t, G)).toEqual({ kind: 'circle', c: [500, 500], r: 200 });
    expect(inTemplate(t, [650, 500], G)).toBe(true);
    expect(inTemplate(t, [750, 500], G)).toBe(false);
  });

  it('point cones and lines in their direction', () => {
    const cone = tpl({ shape: 'cone', distance: 15, direction: 0 });
    expect(inTemplate(cone, [700, 500], G)).toBe(true);
    expect(inTemplate(cone, [300, 500], G)).toBe(false);
    expect(inTemplate(cone, [700, 750], G)).toBe(false);
    const line = tpl({ shape: 'line', distance: 30, direction: 90 });
    expect(inTemplate(line, [500, 1000], G)).toBe(true);
    expect(inTemplate(line, [600, 1000], G)).toBe(false);
  });

  it('centre squares on their origin', () => {
    const sq = tpl({ shape: 'square', distance: 10 });
    expect(templateShape(sq, G)).toEqual({
      kind: 'polygon',
      points: [
        [400, 400],
        [600, 400],
        [600, 600],
        [400, 600],
      ],
    });
  });

  it('aim from the origin to a point, in 5 ft and 15 degree steps', () => {
    const cone = tpl({ shape: 'cone', distance: 15, direction: 0 });
    expect(templateEnd(cone, G)).toEqual([800, 500]);
    expect(aimTemplate(cone, [500, 830], { gridSize: G, free: false })).toEqual({ distance: 15, direction: 90 });
    expect(aimTemplate(cone, [512, 862], { gridSize: G, free: true })).toEqual({ distance: 18, direction: 88 });
  });
});

const square = (points: [number, number][]): Region => ({ id: 'r', points, behaviors: [] });
const BOG = square([
  [300, 0],
  [600, 0],
  [600, 300],
  [300, 300],
]);

describe('regions', () => {
  it('hold the points inside their outline', () => {
    expect(inRegion(BOG, [450, 150])).toBe(true);
    expect(inRegion(BOG, [650, 150])).toBe(false);
  });

  it('tell which regions a walk entered, and where', () => {
    const path: [number, number][] = [
      [150, 150],
      [250, 150],
      [350, 150],
      [450, 150],
    ];
    expect(regionsEntered([BOG], path)).toEqual([{ region: BOG, at: 2 }]);
    // Starting inside is not entering.
    expect(regionsEntered([BOG], path.slice(2))).toEqual([]);
  });

  it('make difficult ground cost more to walk, unless they are off', () => {
    const bog = { ...BOG, behaviors: [{ type: 'difficult' as const }] };
    const cost = regionCost([bog], 0);
    expect(cost([450, 150])).toBe(2);
    expect(cost([150, 150])).toBe(1);
    expect(regionCost([{ ...bog, disabled: true }], 0)([450, 150])).toBe(1);
    expect(regionCost([{ ...bog, activeAt: [0.5, 1] }], 0)([450, 150])).toBe(1);
  });

  it('slow a path through them', () => {
    const tall = square([
      [300, -1000],
      [600, -1000],
      [600, 1000],
      [300, 1000],
    ]);
    const bog = { ...tall, behaviors: [{ type: 'difficult' as const }] };
    const plain = findPath([150, 150], [750, 150], [], { gridSize: G })!;
    const slow = findPath([150, 150], [750, 150], [], { gridSize: G, cost: regionCost([bog], 0) })!;
    expect(plain.feet).toBe(30);
    // Around the bog is longer still; through it, three squares count double.
    expect(slow.feet).toBe(45);
  });
});

describe('ambient sounds', () => {
  const sound = { id: 's', x: 0, y: 0, radius: 30, src: 'a.ogg', volume: 0.8 };
  const open = { gridSize: G, wallsBetween: () => [] };

  it('fade with distance to nothing at their radius', () => {
    expect(soundVolume(sound, [0, 0], open)).toBeCloseTo(0.8);
    expect(soundVolume(sound, [300, 0], open)).toBeCloseTo(0.4);
    expect(soundVolume(sound, [600, 0], open)).toBe(0);
  });

  it('are muffled by walls between, unless they carry through them', () => {
    const wall: Wall = { id: 'w', a: [100, -50], b: [100, 50] };
    const walled = { gridSize: G, wallsBetween: () => [wall] };
    expect(soundVolume(sound, [200, 0], walled)).toBeLessThan(soundVolume(sound, [200, 0], open));
    expect(soundVolume({ ...sound, walls: false }, [200, 0], walled)).toBeCloseTo(soundVolume(sound, [200, 0], open));
  });

  it('are silent when off or hidden', () => {
    expect(soundVolume({ ...sound, hidden: true }, [0, 0], open)).toBe(0);
    expect(soundVolume({ ...sound, activeAt: [0.5, 1] }, [0, 0], { ...open, darkness: 0 })).toBe(0);
  });
});

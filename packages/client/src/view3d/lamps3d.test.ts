import type { PlacedLight } from '@vtt/shared';
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { lampPower, Lamps, lampsOf, nearestLamps } from './lamps3d.ts';

// The scene's lights in 3D: torches, braziers and glowing crystals light the
// models round them, and creatures carrying a light light their way.

const light = (id: string, more: Partial<PlacedLight> = {}): PlacedLight => ({
  id,
  x: 500,
  y: 500,
  bright: 20,
  dim: 20,
  ...more,
});

const input = (more: Partial<Parameters<typeof lampsOf>[0]> = {}): Parameters<typeof lampsOf>[0] => ({
  placed: [],
  carried: [],
  darkness: 0.8,
  px: 20,
  groundAt: () => 0,
  ...more,
});

describe('lights in 3D', () => {
  it('stands a placed light a little over the ground, reaching as far as its dim light', () => {
    const [torch] = lampsOf(input({ placed: [light('torch', { color: '#ff9a40', animation: 'flicker' })] }));
    expect(torch).toMatchObject({ key: 'light:torch', at: [500, 500, 160], reach: 800, animation: 'flicker' });
    expect(torch!.color).toBe(0xff9a40);
  });

  it('hangs a light on an upper floor over that floor', () => {
    const placed = [light('lamp', { level: 'loft' })];
    const [lamp] = lampsOf(input({ placed, floorOf: (level) => (level === 'loft' ? 200 : 0) }));
    expect(lamp!.at[2]).toBe(360);
  });

  it('leaves out lights put out, darkness, those out of their time of day and those on floors not shown', () => {
    const placed = [
      light('out', { hidden: true }),
      light('dark', { darkness: true }),
      light('day', { activeAt: [0, 0.3] }),
      light('upstairs', { level: 'loft' }),
      light('on'),
    ];
    expect(lampsOf(input({ placed, shown: ['ground'] })).map((l) => l.key)).toEqual(['light:on']);
  });

  it('lights a creature carrying a light from its chest', () => {
    const carried = [
      { id: 'bram', light: { bright: 20, dim: 20 }, at: [100, 200] as [number, number], feet: 40, size: 100 },
    ];
    expect(lampsOf(input({ carried }))[0]).toMatchObject({ key: 'token:bram', at: [100, 200, 120] });
  });

  it('keeps the lights nearest the camera, as many as it may', () => {
    const lamps = lampsOf(
      input({ placed: [light('far', { x: 5000 }), light('near', { x: 600 }), light('mid', { x: 1500 })] }),
    );
    expect(nearestLamps(lamps, [500, 500], 2).map((l) => l.key)).toEqual(['light:near', 'light:mid']);
  });

  it('shines stronger in the dark, a torch flickering and a glow pulsing', () => {
    const [still] = lampsOf(input({ placed: [light('a')] }));
    expect(lampPower(still!, 0, 0.9)).toBeGreaterThan(lampPower(still!, 0, 0.1));
    const flicker = { ...still!, animation: 'flicker' as const };
    const seen = new Set([0, 70, 140, 210].map((t) => lampPower(flicker, t, 0.9).toFixed(3)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('keeps a fixed pool of lights, putting out those it has no lamp for', () => {
    const lamps = new Lamps(3);
    expect(lamps.group.children).toHaveLength(3);
    lamps.show(lampsOf(input({ placed: [light('a')] })), [500, 500], 0, 0.8);
    const lit = lamps.group.children.filter((l) => (l as THREE.PointLight).intensity > 0);
    expect(lit).toHaveLength(1);
  });
});

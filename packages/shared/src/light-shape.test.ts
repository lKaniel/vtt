import { describe, expect, it } from 'vitest';
import { inLightCone, lightLevelAt, lightReach, pointInPolygon, visibilityPolygon, type Wall } from './index.ts';

// Light depth: cones of light (a lantern's beam, a lighthouse) and light that
// shines through walls.

const G = 100;
const lamp = { x: 0, y: 0, bright: 30, dim: 0 };
const wall: Wall = { id: 'w', a: [300, -500], b: [300, 500] };
const polygon = (walls: Wall[]) => (at: [number, number], r: number) => visibilityPolygon(at, r, walls);

describe('light cones', () => {
  // Rotation 0 faces down the map (south), as in Foundry; 90 faces west.
  const beam = { ...lamp, angle: 90, rotation: 0 };

  it('light only what lies within the beam', () => {
    expect(inLightCone(beam, [0, 400])).toBe(true);
    expect(inLightCone(beam, [300, 400])).toBe(true);
    expect(inLightCone(beam, [0, -400])).toBe(false);
    expect(inLightCone(beam, [400, 0])).toBe(false);
    expect(inLightCone({ ...beam, rotation: 90 }, [-400, 0])).toBe(true);
    expect(inLightCone(lamp, [0, -400])).toBe(true);
  });

  it('cut the area they light down to the beam, walls and all', () => {
    const poly = lightReach(beam, G, polygon([]));
    expect(pointInPolygon([0, 500], poly)).toBe(true);
    expect(pointInPolygon([0, -500], poly)).toBe(false);
    expect(pointInPolygon([500, 0], poly)).toBe(false);
    const wide = lightReach({ ...beam, angle: 270 }, G, polygon([]));
    expect(pointInPolygon([500, 0], wide)).toBe(true);
    expect(pointInPolygon([0, -500], wide)).toBe(false);
    const east = lightReach({ ...beam, rotation: -90 }, G, polygon([wall]));
    expect(pointInPolygon([200, 0], east)).toBe(true);
    expect(pointInPolygon([400, 0], east)).toBe(false);
  });

  it('leave what is behind the lantern dark', () => {
    const ctx = { darkness: 1, gridSize: G, lights: [{ ...beam }], clear: () => true };
    expect(lightLevelAt([0, 200], ctx).level).toBe('bright');
    expect(lightLevelAt([0, -200], ctx).level).toBe('dark');
  });
});

describe('light that ignores walls', () => {
  const glow = { ...lamp, walls: false };

  it('reaches past walls', () => {
    expect(pointInPolygon([400, 0], lightReach(glow, G, polygon([wall])))).toBe(true);
    expect(pointInPolygon([400, 0], lightReach(lamp, G, polygon([wall])))).toBe(false);
    const ctx = { darkness: 1, gridSize: G, lights: [glow], clear: () => false };
    expect(lightLevelAt([400, 0], ctx).level).toBe('bright');
    expect(lightLevelAt([400, 0], { ...ctx, lights: [lamp] }).level).toBe('dark');
  });
});

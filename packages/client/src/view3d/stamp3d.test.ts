import { describe, expect, it } from 'vitest';
import { stampGhost } from './stamp3d.ts';
import type { StampDoc } from '../editor/stamp.ts';

const doc: StampDoc = {
  x: 0,
  y: 0,
  w: 200,
  h: 100,
  src: '/p.webp',
  rotation: 30,
  model: { src: '/cart.glb', height: 5, rotation: 30 },
};

describe('the stamp brush in 3D', () => {
  it('stands a see-through copy of the model on the brush where it would go', () => {
    const ghost = stampGhost({ armed: true, preview: () => doc }, [100, 50]);
    expect(ghost).toEqual([
      {
        key: `stamp:${JSON.stringify(doc.model)}`,
        rect: { x: 0, y: 0, w: 200, h: 100 },
        model: { src: '/cart.glb', height: 5, rotation: 30, opacity: 0.55 },
      },
    ]);
  });

  it('stands nothing for a picture, with the brush put down, or off the map', () => {
    expect(stampGhost({ armed: true, preview: () => ({ ...doc, model: undefined }) }, [0, 0])).toEqual([]);
    expect(stampGhost({ armed: false, preview: () => doc }, [0, 0])).toEqual([]);
    expect(stampGhost({ armed: true, preview: () => doc }, undefined)).toEqual([]);
  });
});

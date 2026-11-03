import { describe, expect, it } from 'vitest';
import { textureFrame } from './template-looks.ts';

const base = { x: 100, y: 200, distance: 20 };

describe('where a template’s picture or loop lies', () => {
  it('covers a circle, centred on it', () => {
    expect(textureFrame({ ...base, shape: 'circle' }, 100)).toEqual({
      x: 100,
      y: 200,
      w: 800,
      h: 800,
      anchor: [0.5, 0.5],
      rotation: 0,
    });
  });

  it('runs a cone or line out from its tip, along its direction', () => {
    const cone = textureFrame({ ...base, shape: 'cone', direction: 90 }, 100);
    expect(cone).toMatchObject({ x: 100, y: 200, w: 400, h: 400, anchor: [0, 0.5] });
    expect(cone.rotation).toBeCloseTo(Math.PI / 2);
    expect(textureFrame({ ...base, shape: 'line', width: 10 }, 100)).toMatchObject({ w: 400, h: 200 });
  });

  it('turns a square with it', () => {
    expect(textureFrame({ ...base, shape: 'square', direction: 45 }, 100)).toMatchObject({ w: 400, h: 400 });
  });
});

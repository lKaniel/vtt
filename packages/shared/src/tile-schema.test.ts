import { describe, expect, it } from 'vitest';
import { TileSchema } from './schema.ts';

const image = { id: 'roof', kind: 'image', x: 0, y: 0, w: 400, h: 300, src: 'roofs/inn.webp' };

describe('image tiles', () => {
  it('can be roofs that fade for creatures under them, and scroll', () => {
    const roof = TileSchema.parse({ ...image, overhead: true, occludedAlpha: 0.3, scroll: { x: 20, y: 0 } });
    expect(roof).toMatchObject({ overhead: true, occludedAlpha: 0.3, scroll: { x: 20, y: 0 } });
    expect(TileSchema.safeParse({ ...image, occludedAlpha: 2 }).success).toBe(false);
  });
});

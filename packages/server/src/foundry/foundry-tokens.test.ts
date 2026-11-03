import { describe, expect, it } from 'vitest';
import { foundryTokens } from './foundry-actors.ts';

describe('foundryTokens', () => {
  it('keeps the picture and size of a token whose actor is gone, and says so', () => {
    const { tokens, skipped } = foundryTokens(
      [{ name: 'Ghost', actorId: 'GONE', x: 0, y: 0, width: 2, hidden: true, texture: { src: 'art/ghost.webp' } }],
      { grid: 100, actors: new Map(), media: (p) => `/assets/${p}` },
    );
    expect(tokens).toEqual([
      { id: 'ghost', name: 'Ghost', x: 100, y: 100, size: 2, img: '/assets/art/ghost.webp', hidden: true },
    ]);
    expect(skipped).toEqual([expect.objectContaining({ count: 1, examples: ['Ghost'] })]);
  });
});

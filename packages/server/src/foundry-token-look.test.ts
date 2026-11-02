import { describe, expect, it } from 'vitest';
import { foundryTokenLook } from './foundry-token-look.ts';

describe('a Foundry token’s look', () => {
  it('keeps its display modes, scale, mirroring and ring', () => {
    const look = foundryTokenLook({
      displayName: 20,
      displayBars: 40,
      randomImg: true,
      texture: { scaleX: -1.5, scaleY: 1.5 },
      ring: { enabled: true, colors: { ring: '#e0b040', background: '#202020' } },
    });
    expect(look).toEqual({
      displayName: 'ownerHover',
      displayBars: 'owner',
      randomImg: true,
      scale: 1.5,
      mirrorX: true,
      ring: { color: '#e0b040', background: '#202020' },
    });
  });

  it('leaves out Foundry’s defaults, and reads v9’s fields', () => {
    expect(foundryTokenLook({ displayName: 50, texture: { scaleX: 1, scaleY: 1 }, ring: { enabled: false } })).toEqual(
      {},
    );
    expect(foundryTokenLook({ scale: 0.8, mirrorY: true, displayBars: 0 })).toEqual({
      scale: 0.8,
      mirrorY: true,
      displayBars: 'never',
    });
    expect(foundryTokenLook('junk')).toEqual({});
  });
});

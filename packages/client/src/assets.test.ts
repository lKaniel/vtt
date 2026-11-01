import { afterEach, describe, expect, it } from 'vitest';
import { assetUrl, setAssetGame } from './assets.ts';

afterEach(() => setAssetGame(undefined));

describe('asset urls', () => {
  it("point a game's own pictures at that game's assets", () => {
    setAssetGame('lost-mine');
    expect(assetUrl('maps/cave.webp')).toBe('/games/lost-mine/assets/maps/cave.webp');
    expect(assetUrl('/assets/portraits/me.webp')).toBe('/games/lost-mine/assets/portraits/me.webp');
  });

  it('leave bundled art and other sites alone', () => {
    setAssetGame('lost-mine');
    expect(assetUrl('/art/tokens/goblin.webp')).toBe('/art/tokens/goblin.webp');
    expect(assetUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(assetUrl('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
  });

  it('use the home game’s /assets/ outside a game', () => {
    expect(assetUrl('maps/cave.webp')).toBe('/assets/maps/cave.webp');
  });
});

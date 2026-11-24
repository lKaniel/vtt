import { TileTextureSchema, type Tile } from '@vtt/shared';
import { Assets, Texture, TilingSprite } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groundArtUrl, groundTint, rectTile } from './ground.ts';

type RectTile = Extract<Tile, { kind: 'rect' }>;

const tile = (overrides: Partial<RectTile> = {}): RectTile => ({
  id: 't1',
  kind: 'rect',
  x: 0,
  y: 0,
  w: 200,
  h: 200,
  color: '#6f9a4a',
  texture: 'grass',
  edge: 'straight',
  ...overrides,
});

function stubCanvas() {
  const putImageData = vi.fn();
  const fakeCanvas = { width: 0, height: 0, getContext: () => ({ putImageData }) };
  vi.stubGlobal('document', { createElement: () => fakeCanvas });
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
      ) {}
    },
  );
  vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
}

describe('ground textures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('maps every TileTexture kind to its bundled webp path', () => {
    for (const kind of TileTextureSchema.options) {
      expect(groundArtUrl(kind)).toBe(`/art/textures/ground/${kind}.webp`);
    }
  });

  it('keeps default ground colours bright while darkening shadowy tints', () => {
    expect(groundTint('#6f9a4a')).toBe(0xffffff);
    expect(groundTint('#4a7034')).toBeLessThan(0xffffff);
    expect(groundTint('#4a7034')).toBeGreaterThan(0x888888);
  });

  it('shows the painted fallback first, then swaps in the loaded ground picture', async () => {
    stubCanvas();
    const loadedTex = new Texture();
    const loadSpy = vi.spyOn(Assets, 'load').mockResolvedValue(loadedTex as unknown as Record<string, unknown>);

    const view = rectTile(tile({ texture: 'stone' }), { gridSize: 100, chunkSize: 1000 });
    expect(loadSpy).toHaveBeenCalledWith('/art/textures/ground/stone.webp');
    expect(view.root.children).toHaveLength(1);
    expect(view.root.children[0]).toBeInstanceOf(TilingSprite);
    expect((view.root.children[0] as TilingSprite).texture).toBe(Texture.EMPTY);

    await view.loaded;
    expect(view.root.children).toHaveLength(1);
    expect((view.root.children[0] as TilingSprite).texture).toBe(loadedTex);
  });

  it('keeps the painted fallback when the ground picture fails to load', async () => {
    stubCanvas();
    vi.spyOn(Assets, 'load').mockRejectedValue(new Error('404'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const view = rectTile(tile({ texture: 'dirt' }), { gridSize: 100, chunkSize: 1000 });
    await view.loaded;
    expect(warn).toHaveBeenCalled();
    expect(view.root.children).toHaveLength(1);
    expect((view.root.children[0] as TilingSprite).texture).toBe(Texture.EMPTY);
  });
});

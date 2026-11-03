import { Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { videoFx } from './video-fx.ts';

afterEach(() => vi.unstubAllGlobals());

describe('a video animation', () => {
  it('waits for the video’s first frame before making its texture, so no empty frame is uploaded', () => {
    const video = { readyState: 0, videoWidth: 0, play: () => Promise.resolve(), pause: () => undefined };
    vi.stubGlobal('document', { createElement: () => video });
    const fx = videoFx('/packs/jb2a/swing.webm', { at: [0, 0], r: 50 }, { at: [100, 0], r: 50 }, { ranged: false });
    expect(fx.update(16)).toBe(true);
    expect(fx.view.visible).toBe(false);
    expect((fx.view as unknown as { texture: Texture }).texture).toBe(Texture.EMPTY);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { setAssetGame } from '../assets.ts';
import { DRACO_PATH, loadModel, modelLoader } from './model-loader.ts';

// Model kits (Baileywiki, 3D Canvas's compendium) squeeze their meshes with
// Draco; the loader decodes them with the decoder the client serves at /draco/.

describe('the model loader', () => {
  it('decodes Draco-compressed meshes', () => {
    const loader = modelLoader();
    expect(loader.dracoLoader).not.toBeNull();
    expect(DRACO_PATH).toBe('/draco/');
  });

  it('says which model failed to load instead of failing silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = { loadAsync: () => Promise.reject(new Error('no draco')) };
    expect(await loadModel(failing, '/assets/foundry/wall.glb')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Model /assets/foundry/wall.glb did not load: no draco');
    warn.mockRestore();
  });

  it("loads a game's own model from that game's assets", async () => {
    setAssetGame('cursed-lands');
    const asked: string[] = [];
    const loader = { loadAsync: (url: string) => (asked.push(url), Promise.reject(new Error('x'))) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await loadModel(loader, '/assets/foundry/wall.glb');
    await loadModel(loader, 'https://assets.forge-vtt.com/bazaar/web.glb');
    expect(asked).toEqual([
      '/games/cursed-lands/assets/foundry/wall.glb',
      'https://assets.forge-vtt.com/bazaar/web.glb',
    ]);
    warn.mockRestore();
    setAssetGame(undefined);
  });
});

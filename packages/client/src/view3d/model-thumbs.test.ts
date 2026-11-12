import { describe, expect, it, vi } from 'vitest';
import { ModelInfos, type ModelInfo } from './model-thumbs.ts';

const info = (src: string): ModelInfo => ({ thumb: `data:${src}`, size: [1, 2, 3] });

describe('model pictures and sizes', () => {
  it('renders each model once, one at a time', async () => {
    let running = 0;
    let most = 0;
    const render = vi.fn(async (src: string) => {
      most = Math.max(most, ++running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return info(src);
    });
    const infos = new ModelInfos(render);
    const [a, b, again] = await Promise.all([infos.of('/a.glb'), infos.of('/b.glb'), infos.of('/a.glb')]);
    expect(a).toEqual(info('/a.glb'));
    expect(b).toEqual(info('/b.glb'));
    expect(again).toBe(a);
    expect(render).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
    expect(infos.peek('/a.glb')).toEqual(info('/a.glb'));
    expect(infos.peek('/c.glb')).toBeUndefined();
  });

  it('keeps what it rendered in the store, and reads it back before rendering', async () => {
    const kept = new Map<string, ModelInfo>();
    const store = {
      get: (src: string) => Promise.resolve(kept.get(src)),
      set: (src: string, i: ModelInfo) => {
        kept.set(src, i);
        return Promise.resolve();
      },
    };
    await new ModelInfos((src) => Promise.resolve(info(src)), store).of('/a.glb');
    const render = vi.fn(() => Promise.resolve(undefined));
    expect(await new ModelInfos(render, store).of('/a.glb')).toEqual(info('/a.glb'));
    expect(render).not.toHaveBeenCalled();
  });

  it('gives nothing for a model that fails, and the next still renders', async () => {
    const infos = new ModelInfos((src) =>
      src === '/bad.glb' ? Promise.reject(new Error('broken')) : Promise.resolve(info(src)),
    );
    expect(await infos.of('/bad.glb')).toEqual({});
    expect(await infos.of('/good.glb')).toEqual(info('/good.glb'));
  });

  it('keeps going when the store fails', async () => {
    const store = { get: () => Promise.reject(new Error('no')), set: () => Promise.reject(new Error('no')) };
    expect(await new ModelInfos((src) => Promise.resolve(info(src)), store).of('/a.glb')).toEqual(info('/a.glb'));
  });
});

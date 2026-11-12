import { describe, expect, it, vi } from 'vitest';
import { ModelPlans, planName } from './model-plans.ts';

const src = '/assets/foundry/modules/baileywiki-3d/models/props-natural/bushes/01-bush.glb';

function plans(media: string[] = []) {
  const upload = vi.fn((name: string) => Promise.resolve(`/assets/uploads/${name}`));
  const render = vi.fn(() => Promise.resolve('data:image/webp;base64,AAAA'));
  return { plans: new ModelPlans({ media: () => media.map((s) => ({ src: s })), upload, render }), upload, render };
}

describe('model plans', () => {
  it('names a plan after its model, told apart from another model of that name', () => {
    expect(planName(src)).toMatch(/^plan-01-bush-[0-9a-z]+\.webp$/);
    expect(planName(src)).not.toBe(planName(src.replace('props-natural', 'trees')));
    expect(planName(src)).toBe(planName(src));
  });

  it('draws a model from above and saves it in the game, once', async () => {
    const { plans: p, upload, render } = plans();
    const [a, b] = await Promise.all([p.of(src), p.of(src)]);
    expect(a).toBe(`/assets/uploads/${planName(src)}`);
    expect(b).toBe(a);
    expect(render).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(planName(src), 'AAAA');
    expect(p.ready(src)).toBe(a);
  });

  it('uses the plan the game already has', async () => {
    const saved = `/assets/uploads/${planName(src)}`;
    const { plans: p, render } = plans([saved]);
    expect(await p.of(src)).toBe(saved);
    expect(render).not.toHaveBeenCalled();
  });

  it('gives no plan for a model that will not draw, and tries again next time', async () => {
    const { plans: p, render } = plans();
    render.mockResolvedValueOnce(undefined as never);
    expect(await p.of(src)).toBeUndefined();
    expect(await p.of(src)).toBe(`/assets/uploads/${planName(src)}`);
  });
});

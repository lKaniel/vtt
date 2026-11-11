import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rasterStroke } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { FogStore, fogPlace } from './fog-store.ts';

describe('fog on a floor', () => {
  it('is saved in a folder of its own and read back', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fog-'));
    const fog = new FogStore(dir);
    fog.explore(fogPlace('main', 'loft'), 'ana', 25, [rasterStroke([[100, 100]], 50, 25)]);
    fog.explore(fogPlace('main', undefined), 'ana', 25, [rasterStroke([[500, 500]], 50, 25)]);
    await fog.flush();
    expect(await readdir(join(dir, 'scenes/main/fog/loft'))).toEqual(['ana.json']);

    const again = new FogStore(dir);
    await again.load(['main']);
    expect(again.map(fogPlace('main', 'loft'), 'ana', 25).explored([100, 100])).toBe(true);
    expect(again.map(fogPlace('main', 'loft'), 'ana', 25).explored([500, 500])).toBe(false);
    expect(again.map('main', 'ana', 25).explored([500, 500])).toBe(true);
    again.prune([]);
    await again.flush();
    expect(await readdir(join(dir, 'scenes/main/fog/loft'))).toEqual([]);
  });
});

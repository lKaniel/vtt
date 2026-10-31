import type { Chunk } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { LIGHT_PRESETS, pickAt, snapPoint, wallEdit } from './map-tools.ts';

describe('snapPoint', () => {
  it('snaps to the nearest square corner, or not at all when asked', () => {
    expect(snapPoint([140, 260], 100, true)).toEqual([100, 300]);
    expect(snapPoint([140, 260], 100, false)).toEqual([140, 260]);
  });
});

describe('wallEdit', () => {
  it('draws walls, doors or windows', () => {
    expect(wallEdit('wall', [0, 0], [100, 0])).toEqual({ op: 'addWall', wall: { a: [0, 0], b: [100, 0] } });
    expect(wallEdit('door', [0, 0], [100, 0]).wall.door).toBe('closed');
    expect(wallEdit('window', [0, 0], [100, 0]).wall.sight).toBe(false);
  });
});

describe('pickAt', () => {
  const chunks = new Map<string, Chunk>([
    [
      '0_0',
      {
        tiles: [],
        walls: [{ id: 'w', a: [0, 0], b: [400, 0] }],
        lights: [{ id: 'torch', x: 200, y: 200, bright: 20, dim: 20 }],
      },
    ],
  ]);

  it('finds the light or wall under the pointer', () => {
    expect(pickAt(chunks, [205, 195], 20)).toEqual({ chunk: '0_0', id: 'torch', kind: 'light', at: [200, 200] });
    expect(pickAt(chunks, [150, 8], 20)).toMatchObject({ chunk: '0_0', id: 'w', kind: 'wall' });
    expect(pickAt(chunks, [150, 80], 20)).toBeUndefined();
  });
});

describe('LIGHT_PRESETS', () => {
  it('offers common lights with rules radii', () => {
    expect(LIGHT_PRESETS.torch).toMatchObject({ bright: 20, dim: 20, animation: 'flicker' });
    expect(LIGHT_PRESETS.darkness.darkness).toBe(true);
  });
});

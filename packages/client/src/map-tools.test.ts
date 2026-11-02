import { describe, expect, it } from 'vitest';
import { snapPoint, wallEdit } from './map-tools.ts';

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
    expect(wallEdit('window', [0, 0], [100, 0]).wall).toMatchObject({ sight: 'none', light: 'none' });
  });
});

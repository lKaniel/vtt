import { describe, expect, it } from 'vitest';
import { steerPinch, type CameraSteer } from './input3d.ts';
import { ORBIT } from './orbit.ts';

function recorder() {
  const calls = { zoom: [] as number[], turn: [] as number[], pan: [] as unknown[] };
  const steer = {
    zoom: (n: number) => calls.zoom.push(n),
    turn: (r: number) => calls.turn.push(r),
    pan: (by: unknown) => calls.pan.push(by),
  } as unknown as CameraSteer;
  return { steer, calls };
}

describe('two fingers on the 3D view', () => {
  it('spreading them brings the camera in by the same factor', () => {
    const { steer, calls } = recorder();
    steerPinch(steer, { scale: 2, centre: [0, 0], pan: [0, 0], turn: 0 });
    const notches = calls.zoom[0]!;
    expect(notches).toBeLessThan(0);
    expect(ORBIT.zoomStep ** notches).toBeCloseTo(0.5);
    expect(calls.pan).toEqual([]);
    expect(calls.turn).toEqual([]);
  });

  it('moving them together pans, and twisting them turns the camera', () => {
    const { steer, calls } = recorder();
    steerPinch(steer, { scale: 1, centre: [0, 0], pan: [12, -4], turn: 0.3 });
    expect(calls.zoom).toEqual([]);
    expect(calls.pan).toEqual([[12, -4]]);
    expect(calls.turn).toEqual([-0.3]);
  });
});

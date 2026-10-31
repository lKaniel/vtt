import { describe, expect, it } from 'vitest';
import { CameraMotion } from './camera-motion.ts';

const screen = { width: 1000, height: 800 };

describe('CameraMotion', () => {
  it('eases toward a new zoom and keeps the point under the cursor still', () => {
    const cam = new CameraMotion([0, 0], 1);
    cam.zoomAt(2, [900, 400], screen);
    const before = cam.screenToWorld([900, 400], screen);
    cam.step(0.016);
    expect(cam.zoom).toBeGreaterThan(1);
    expect(cam.zoom).toBeLessThan(2);
    expect(cam.screenToWorld([900, 400], screen)[0]).toBeCloseTo(before[0]);
    for (let i = 0; i < 120; i++) cam.step(0.016);
    expect(cam.zoom).toBeCloseTo(2);
    expect(cam.screenToWorld([900, 400], screen)[0]).toBeCloseTo(before[0]);
  });

  it('keeps gliding after a fling and slows to a stop', () => {
    const cam = new CameraMotion([0, 0], 1);
    cam.drag([100, 0], 0.016);
    cam.release();
    const moving = cam.step(0.016);
    expect(moving).toBe(true);
    const after = cam.center[0];
    expect(after).toBeLessThan(-100);
    for (let i = 0; i < 300; i++) cam.step(0.016);
    expect(cam.step(0.016)).toBe(false);
  });

  it('glides to a point it is asked to show', () => {
    const cam = new CameraMotion([0, 0], 1);
    cam.glideTo([1000, 500]);
    cam.step(0.016);
    expect(cam.center[0]).toBeGreaterThan(0);
    expect(cam.center[0]).toBeLessThan(1000);
    for (let i = 0; i < 200; i++) cam.step(0.016);
    expect(cam.center[0]).toBeCloseTo(1000);
    expect(cam.center[1]).toBeCloseTo(500);
  });

  it('stops gliding as soon as you grab the map', () => {
    const cam = new CameraMotion([0, 0], 1);
    cam.glideTo([1000, 0]);
    cam.drag([0, 0], 0.016);
    for (let i = 0; i < 50; i++) cam.step(0.016);
    expect(cam.center[0]).toBe(0);
  });

  it('clamps zoom', () => {
    const cam = new CameraMotion([0, 0], 1);
    cam.zoomAt(100, [0, 0], screen);
    for (let i = 0; i < 300; i++) cam.step(0.016);
    expect(cam.zoom).toBe(3);
  });
});

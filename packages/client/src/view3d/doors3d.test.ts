import type { TileDoor } from '@vtt/shared';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DoorClock, Leaves, ModelDoors, poseOf } from './doors3d.ts';
import type { DoorBox } from './walls3d.ts';

// Doors in 3D, as in BG3: a door's leaf swings open on its hinge and back,
// and a door model (a chest, a secret wall, a drawbridge) moves the way its
// tile says when its door wall opens.

describe('how far a door has opened', () => {
  it('stands as it is when first seen, then moves over its time when it changes', () => {
    const clock = new DoorClock();
    expect(clock.at('cell', true, 400, 0)).toBe(1);
    expect(clock.at('cell', false, 400, 100)).toBe(1);
    expect(clock.at('cell', false, 400, 300)).toBeGreaterThan(0);
    expect(clock.at('cell', false, 400, 300)).toBeLessThan(1);
    expect(clock.at('cell', false, 400, 600)).toBe(0);
  });

  it('turns back from where it is when it changes again midway', () => {
    const clock = new DoorClock();
    clock.at('gate', false, 400, 0);
    clock.at('gate', true, 400, 0);
    const mid = clock.at('gate', true, 400, 200);
    expect(clock.at('gate', false, 400, 200)).toBeCloseTo(mid);
    expect(clock.at('gate', false, 400, 1000)).toBe(0);
  });
});

describe('how a door model moves', () => {
  const size: [number, number, number] = [2, 3, 0.2];
  const look = (style: TileDoor['style'], more: Partial<TileDoor> = {}): TileDoor => ({ wall: 'w', style, ...more });

  it('swings round by its angle', () => {
    expect(poseOf(look('swing', { angle: 90 }), 1, size).turn).toBeCloseTo(Math.PI / 2);
    expect(poseOf(look('swing', { angle: 90 }), 0, size).turn).toBe(0);
  });

  it('slides its share of its length toward its angle, or lifts its share of its height', () => {
    const slid = poseOf(look('slide', { angle: 0, slide: 50 }), 1, size).shift;
    expect(slid[0]).toBeCloseTo(1);
    expect(slid[2]).toBeCloseTo(0);
    expect(poseOf(look('lift', { slide: 100 }), 1, size).shift[1]).toBeCloseTo(3);
  });

  it('fades to see-through open, and plays its animation forward or backward', () => {
    expect(poseOf(look('fade'), 1, size).opacity).toBeCloseTo(0.4);
    expect(poseOf(look('play'), 0.25, size).clip).toBeCloseTo(0.25);
    expect(poseOf(look('rewind'), 0.25, size).clip).toBeCloseTo(0.75);
  });
});

describe('door leaves', () => {
  const box = (id: string, open: boolean): DoorBox => ({
    id,
    open,
    a: [0, 0],
    mid: [50, 0],
    length: 100,
    angle: 0,
    bottom: 0,
    height: 200,
    kind: 'door',
  });

  it('hang a leaf on each door, swung open when it is open', () => {
    const leaves = new Leaves();
    leaves.show([box('shut', false), box('open', true)], 0, 0);
    const [shut, open] = leaves.group.children;
    expect(shut!.rotation.y).toBeCloseTo(0);
    expect(Math.abs(open!.rotation.y)).toBeCloseTo(Math.PI / 2);
    leaves.show([box('open', true)], 0, 10);
    expect(leaves.group.children).toHaveLength(1);
  });
});

describe('door models', () => {
  it('turn a swinging door copy round its own origin when its wall opens', () => {
    const doors = new ModelDoors();
    const copy = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.2)));
    const all = [{ key: 'tile:door', look: { wall: 'w', style: 'swing' as const, angle: 90, ms: 400 }, open: false }];
    doors.update(all, () => [copy], 0);
    expect(copy.children[0]!.rotation.y).toBe(0);
    doors.update([{ ...all[0]!, open: true }], () => [copy], 100);
    doors.update([{ ...all[0]!, open: true }], () => [copy], 1000);
    expect(copy.children[0]!.rotation.y).toBeCloseTo(Math.PI / 2);
  });
});

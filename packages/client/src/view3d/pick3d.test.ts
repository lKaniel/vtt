import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Picker, type PickScene } from './pick3d.ts';

// What the pointer is on in 3D: a creature's picture first, else the first
// surface it meets, else the floor; asked twice in a frame it looks once.

/** A camera high over (500, 500) looking straight down, a 100 px canvas, and a box 40 px high under the middle. */
function scene(creature?: string): PickScene & { looks: number } {
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 10000);
  camera.position.set(500, 1000, 500);
  camera.lookAt(500, 0, 500);
  camera.updateMatrixWorld();
  const box = new THREE.Mesh(new THREE.BoxGeometry(100, 40, 100));
  box.position.set(500, 20, 500);
  box.updateMatrixWorld();
  const s = {
    looks: 0,
    camera,
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } as HTMLElement,
    creature: () => (s.looks++, creature),
    placeOf: (id: string) => (id === 'bram' ? ([480, 520] as [number, number]) : undefined),
    surfaces: () => [box],
    peek: () => undefined,
    floor: () => 0,
    target: () => [500, 500, 0] as const,
  };
  return s;
}

describe('picking in 3D', () => {
  it('lands on the top of what is under the pointer', () => {
    const picked = new Picker(scene()).pick(50, 50, 1);
    expect(picked.at[0]).toBeCloseTo(500);
    expect(picked.point.y).toBeCloseTo(40);
    expect(picked.normal.y).toBeCloseTo(1);
  });

  it('lands on the floor off every surface', () => {
    const picked = new Picker(scene()).pick(2, 2, 1);
    expect(picked.point.y).toBeCloseTo(0);
    expect(picked.at[0]).toBeLessThan(450);
  });

  it('gives a creature its own spot, unless a drag looks through it', () => {
    const picker = new Picker(scene('bram'));
    expect(picker.pick(50, 50, 1)).toMatchObject({ at: [480, 520], creature: 'bram' });
    picker.held = true;
    expect(picker.pick(50, 50, 2).creature).toBeUndefined();
  });

  it('looks once a frame for the same pointer', () => {
    const s = scene();
    const picker = new Picker(s);
    picker.pick(50, 50, 1);
    picker.pick(50, 50, 1);
    expect(s.looks).toBe(1);
    picker.pick(50, 50, 2);
    picker.pick(40, 50, 2);
    expect(s.looks).toBe(3);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Backdrop } from './scene3d.ts';

// What is round the map in 3D: the ground beyond it, unless the scene has none.

describe('the backdrop', () => {
  it('lays the ground in its colour, or none at all', () => {
    const backdrop = new Backdrop();
    const scene = new THREE.Scene();
    backdrop.show(scene, { ground: '#341f0f', background: '#000000' }, 0);
    expect(backdrop.table.visible).toBe(true);
    expect(backdrop.table.material.color.getHexString()).toBe('341f0f');
    backdrop.show(scene, { ground: 'none', background: '#000000' }, 0);
    expect(backdrop.table.visible).toBe(false);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Backdrop, hazeOf } from './scene3d.ts';

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

  it('shows the fog colour all round instead of the sky when the scene has fog, as 3D Canvas does', () => {
    const backdrop = new Backdrop();
    const scene = new THREE.Scene();
    const fog = { color: '#d9d0b4', distance: 8000 };
    backdrop.show(scene, { ground: 'none', background: '#000000', fog }, 0);
    expect((scene.background as THREE.Color).getHexString()).toBe('d9d0b4');
    expect(hazeOf({ ground: 'none', background: '#000000', fog }, 100, [500, 900])).toMatchObject({
      near: 1000,
      far: 8000,
    });
    const plain = hazeOf({ ground: 'none', background: '#123456' }, 100, [500, 900]);
    expect([plain.near, plain.far, plain.color.getHexString()]).toEqual([500, 900, '123456']);
  });
});

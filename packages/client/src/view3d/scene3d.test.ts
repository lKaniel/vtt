import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { nearestStandee } from './scene3d.ts';

// Picking a creature from afar: its picture is a few pixels tall, so a click
// close beside it (within the slack, an angle) still picks it, the nearest
// first, and one far off picks nobody.

function standee(id: string, x: number): THREE.Sprite {
  const s = new THREE.Sprite();
  s.position.set(x, 0, 0);
  s.scale.set(100, 100, 1);
  s.userData.token = id;
  return s;
}

/** A ray from 5000 px south of the origin, looking north past `x`, chest high. */
const rayAt = (x: number) => new THREE.Ray(new THREE.Vector3(x, 50, 5000), new THREE.Vector3(0, 0, -1));

describe('nearestStandee', () => {
  const slack = 0.02; // about 100 px at 5000 px away

  it('picks a creature a click lands close beside', () => {
    expect(nearestStandee([standee('bram', 0)], rayAt(90), slack)).toBe('bram');
  });

  it('picks the nearest of two', () => {
    expect(nearestStandee([standee('bram', 0), standee('ida', 200)], rayAt(130), slack)).toBe('ida');
  });

  it('picks nobody when the click is far from them all', () => {
    expect(nearestStandee([standee('bram', 0)], rayAt(400), slack)).toBeUndefined();
  });
});

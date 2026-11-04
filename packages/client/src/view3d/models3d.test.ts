import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { faded, Models, seeThrough } from './models3d.ts';

// How much of a model shows: 3D Canvas's transparency.

describe('models in the 3D view', () => {
  it('hides an unseen model and lets a part-seen one through, on copies of its materials', () => {
    const own = new THREE.MeshStandardMaterial();
    const scene = () => new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), own));
    const unseen = scene();
    faded(unseen, 0);
    expect(unseen.visible).toBe(false);
    const faint = scene();
    faded(faint, 0.4);
    const m = (faint.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect([m === own, m.transparent, m.opacity]).toEqual([false, true, 0.4]);
  });

  it('lets every material of a model fade when your creature is inside', () => {
    const scene = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial()]));
    seeThrough(scene);
    const [m] = (scene.children[0] as THREE.Mesh).material as THREE.Material[];
    expect(m!.customProgramCacheKey()).toContain('peek');
  });

  it('counts each time the copies are stood again, so what stands on them looks again (a lift)', () => {
    const models = new Models();
    const ground = { grid: 100, feet: 5, floor: 0 };
    models.show([], ground, 0);
    models.show([], ground, 0);
    expect(models.stood).toBe(1);
    models.restand();
    models.show([], ground, 0);
    expect(models.stood).toBe(2);
  });
});

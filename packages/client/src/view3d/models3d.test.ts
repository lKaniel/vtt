import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { faded, glowing, isFigure, Models, seeThrough } from './models3d.ts';

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

  it('glows gold while the pointer is on its object, on copies of its materials, then looks as before', () => {
    const own = new THREE.MeshStandardMaterial();
    const scene = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), own));
    const mesh = scene.children[0] as THREE.Mesh;
    glowing(scene, true);
    const lit = mesh.material as THREE.MeshStandardMaterial;
    expect([lit === own, lit.emissive.getHex() > 0, own.emissive.getHex()]).toEqual([false, true, 0]);
    glowing(scene, true);
    expect(mesh.material).toBe(lit);
    glowing(scene, false);
    expect(mesh.material).toBe(own);
  });

  it("lights only the hovered tile's model", () => {
    const models = new Models();
    expect(models.glow('tile:lever')).toBe(false);
  });
});

describe('figures', () => {
  it('tells a creature’s figure from a tile’s model', () => {
    const models = new Models();
    const model = { src: '/none.glb' } as never;
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    models.show(
      [
        { key: 'token:bram', rect, model, figure: true },
        { key: 'tile:hut', rect, model },
      ],
      { grid: 100, feet: 5, floor: 0 },
      0,
    );
    const [bram, hut] = models.group.children;
    const piece = new THREE.Mesh();
    bram!.add(piece);
    expect(isFigure(piece)).toBe(true);
    expect(isFigure(hut!)).toBe(false);
    expect(isFigure(null)).toBe(false);
  });
});

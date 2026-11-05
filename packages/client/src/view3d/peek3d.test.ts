import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PEEK, type Peek, hides, peekAt, peekable, SeeIn } from './peek3d.ts';

// A creature at (1000, 1000) whose head is 140 px up, inside a house from
// (500, 500) to (1500, 1500), the camera to the south (+y on the map).
const peek: Peek = {
  at: [1000, 1000],
  head: 140,
  low: 30,
  box: { min: [500, 500], max: [1500, 1500] },
  toward: [0, 1],
};

describe('seeing in where your creature is (BG3)', () => {
  it('hides what is over its head in its house, not the house next door', () => {
    expect(hides(peek, [1100, 300, 900])).toBe(true);
    expect(hides(peek, [1450, 300, 600])).toBe(true);
    expect(hides(peek, [1100, 100, 900])).toBe(false);
    expect(hides(peek, [1600, 300, 900])).toBe(false);
  });

  it('fades walls between it and the camera, above their foot', () => {
    expect(hides(peek, [1000, 80, 1300])).toBe(true);
    expect(hides(peek, [1000, 20, 1300])).toBe(false);
    expect(hides(peek, [1000, 80, 700])).toBe(false);
  });

  it('fades nothing when it is outside', () => {
    expect(hides(undefined, [1100, 300, 900])).toBe(false);
  });

  it('shares its inputs with every shader, off when outside', () => {
    peekAt(peek);
    expect(PEEK.uPeekBox.value.toArray()).toEqual([500, 500, 1500, 1500]);
    expect(PEEK.uPeekAt.value.toArray()).toEqual([1000, 1000, 1]);
    expect(PEEK.uPeekCut.value.toArray()).toEqual([140, 30, 0, 1]);
    peekAt(undefined);
    expect(PEEK.uPeekAt.value.z).toBe(0);
  });

  it('adds the fade to a material, after what it already did to its shader', () => {
    const material = new THREE.MeshStandardMaterial();
    const seen: string[] = [];
    material.onBeforeCompile = () => {
      seen.push('paint');
    };
    peekable(material);
    peekable(material);
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <project_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}',
    };
    material.onBeforeCompile(shader as never, undefined as never);
    expect(seen).toEqual(['paint']);
    expect(shader.uniforms).toHaveProperty('uPeekBox');
    expect(shader.vertexShader).toContain('vPeekWorld = ');
    expect(shader.fragmentShader.match(/discard/g)).toHaveLength(1);
    expect(material.customProgramCacheKey()).toContain('peek');
  });
});

describe('seeing into the house your creature is in', () => {
  const block = ([x, z]: [number, number], [w, d]: [number, number], y: [number, number]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, y[1] - y[0], d));
    mesh.position.set(x, (y[0] + y[1]) / 2, z);
    mesh.updateMatrixWorld();
    return mesh;
  };
  // A room 400 px square round (1000, 1000): four walls and a roof.
  const roof = new THREE.Group().add(
    block([1000, 800], [400, 10], [0, 240]),
    block([1000, 1200], [400, 10], [0, 240]),
    block([800, 1000], [10, 400], [0, 240]),
    block([1200, 1000], [10, 400], [0, 240]),
    block([1000, 1000], [400, 400], [260, 280]),
  );
  roof.updateMatrixWorld(true);
  const scale = { px: 20, grid: 100 };

  it('hides the house round it, towards the camera', () => {
    const see = new SeeIn(() => [roof]);
    see.update({ id: 'bram', at: [1000, 1000], feet: 0 }, 0, scale);
    expect(see.peek).toMatchObject({ at: [1000, 1000], head: 140, low: 40, toward: [0, 1] });
    expect(see.peek!.box.min[0]).toBeLessThanOrEqual(800);
    expect(see.peek!.box.max[1]).toBeGreaterThanOrEqual(1200);
    expect(PEEK.uPeekAt.value.z).toBe(1);
  });

  it('fades nothing outside, or with no creature', () => {
    const see = new SeeIn(() => [roof]);
    see.update({ id: 'bram', at: [2000, 1000], feet: 0 }, 0, scale);
    expect(see.peek).toBeUndefined();
    see.update(undefined, 0, scale);
    expect(see.peek).toBeUndefined();
    expect(PEEK.uPeekAt.value.z).toBe(0);
  });

  it('looks for the roof again only when it moves or the models change', () => {
    let looks = 0;
    const see = new SeeIn(() => (looks++, [roof]));
    const bram = { id: 'bram', at: [1000, 1000] as [number, number], feet: 0 };
    see.update(bram, 0, scale);
    see.update(bram, 1, scale);
    expect(looks).toBe(1);
    see.forget();
    see.update(bram, 1, scale);
    expect(looks).toBe(2);
  });
});

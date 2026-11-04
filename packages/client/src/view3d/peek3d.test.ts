import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PEEK, type Peek, hides, peekAt, peekable, roofOver, SeeIn } from './peek3d.ts';

// A creature at (1000, 1000) whose head is 140 px up, the camera to the south (+y on the map).
const peek: Peek = { at: [1000, 1000], head: 140, low: 30, radius: 700, toward: [0, 1] };

describe('seeing in where your creature is (BG3)', () => {
  it('fades what is over its head near it', () => {
    expect(hides(peek, [1100, 300, 900])).toBe(true);
    expect(hides(peek, [1100, 100, 900])).toBe(false);
    expect(hides(peek, [2000, 300, 900])).toBe(false);
  });

  it('fades walls between it and the camera, above their foot', () => {
    expect(hides(peek, [1000, 80, 1300])).toBe(true);
    expect(hides(peek, [1000, 20, 1300])).toBe(false);
    expect(hides(peek, [1000, 80, 700])).toBe(false);
  });

  it('fades nothing when it is outside', () => {
    expect(hides(undefined, [1100, 300, 900])).toBe(false);
  });

  it('finds a roof over its head, not one off to the side', () => {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(400, 20, 400));
    roof.position.set(1000, 300, 1000);
    roof.updateMatrixWorld();
    expect(roofOver([roof], [1000, 1000], 140, 1000)).toBe(true);
    expect(roofOver([roof], [1600, 1000], 140, 1000)).toBe(false);
    expect(roofOver([roof], [1000, 1000], 140, 100)).toBe(false);
  });

  it('shares its inputs with every shader, off when outside', () => {
    peekAt(peek);
    expect(PEEK.uPeek.value.toArray()).toEqual([1000, 1000, 700, 1]);
    expect(PEEK.uPeekCut.value.toArray()).toEqual([140, 30, 0, 1]);
    peekAt(undefined);
    expect(PEEK.uPeek.value.w).toBe(0);
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
    expect(shader.uniforms).toHaveProperty('uPeek');
    expect(shader.vertexShader).toContain('vPeekWorld = ');
    expect(shader.fragmentShader.match(/discard/g)).toHaveLength(1);
    expect(material.customProgramCacheKey()).toContain('peek');
  });
});

describe('whether your creature is inside', () => {
  const roof = new THREE.Mesh(new THREE.BoxGeometry(400, 20, 400));
  roof.position.set(1000, 300, 1000);
  roof.updateMatrixWorld();
  const scale = { px: 20, grid: 100 };

  it('fades round it under a roof, towards the camera', () => {
    const see = new SeeIn(() => [roof]);
    see.update({ id: 'bram', at: [1000, 1000], feet: 0 }, 0, scale);
    expect(see.peek).toEqual({ at: [1000, 1000], head: 140, low: 40, radius: 500, toward: [0, 1] });
    expect(PEEK.uPeek.value.w).toBe(1);
  });

  it('fades nothing outside, or with no creature', () => {
    const see = new SeeIn(() => [roof]);
    see.update({ id: 'bram', at: [2000, 1000], feet: 0 }, 0, scale);
    expect(see.peek).toBeUndefined();
    see.update(undefined, 0, scale);
    expect(see.peek).toBeUndefined();
    expect(PEEK.uPeek.value.w).toBe(0);
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

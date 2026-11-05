import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PEEK, type Peek, hides, peekAt, peekable, SeeIn } from './peek3d.ts';

// A creature at (1000, 1000) on the floor (feet 0), its chest 80 px up, the
// camera to the south (+z) and up; inside a house from (500, 500) to (1500, 1500).
const peek: Peek = {
  at: [1000, 1000],
  low: 40,
  chest: [1000, 80, 1000],
  eye: [1000, 1080, 2000],
  radius: 150,
  room: { box: { min: [500, 500], max: [1500, 1500] }, toward: [0, 1] },
};
const outside: Peek = { ...peek, room: undefined };

describe('seeing your creature (BG3)', () => {
  it('cuts what stands between it and the camera, however high', () => {
    expect(hides(outside, [1000, 580, 1500])).toBe(true);
    expect(hides(outside, [1000, 300, 1220])).toBe(true);
    expect(hides(outside, [1100, 600, 1500])).toBe(true);
  });

  it('keeps what is off that line: the floors above and behind it, the houses beside it', () => {
    expect(hides(outside, [1000, 300, 700])).toBe(false);
    expect(hides(outside, [1600, 580, 1500])).toBe(false);
    expect(hides(outside, [1000, 600, 1000])).toBe(false);
  });

  it('never cuts the floor it stands on or what lies low on it', () => {
    expect(hides(outside, [1000, 20, 1100])).toBe(false);
    expect(hides(peek, [1000, 30, 1300])).toBe(false);
  });

  it('inside, cuts the building on the camera side down to the knees', () => {
    expect(hides(peek, [1400, 80, 1300])).toBe(true);
    expect(hides(peek, [1400, 80, 700])).toBe(false);
    expect(hides(peek, [1400, 80, 1700])).toBe(false);
  });

  it('cuts nothing with no creature', () => {
    expect(hides(undefined, [1000, 580, 1500])).toBe(false);
  });

  it('shares its inputs with every shader, off with no creature', () => {
    peekAt(peek);
    expect(PEEK.uPeekAt.value.toArray()).toEqual([1000, 1000, 40, 1]);
    expect(PEEK.uPeekChest.value.toArray()).toEqual([1000, 80, 1000, 150]);
    expect(PEEK.uPeekBox.value.toArray()).toEqual([500, 500, 1500, 1500]);
    expect(PEEK.uPeekRoom.value.toArray()).toEqual([0, 1, 1]);
    peekAt(outside);
    expect(PEEK.uPeekRoom.value.z).toBe(0);
    peekAt(undefined);
    expect(PEEK.uPeekAt.value.w).toBe(0);
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

  const eye = [1000, 1000, 2000] as const;

  it('cuts the house round it towards the camera, and a tube to its chest', () => {
    const see = new SeeIn(() => [roof]);
    see.update({ id: 'bram', at: [1000, 1000], feet: 0 }, eye, scale);
    expect(see.peek).toMatchObject({ at: [1000, 1000], low: 40, chest: [1000, 80, 1000], eye });
    expect(see.peek!.radius).toBeGreaterThanOrEqual(140);
    expect(see.peek!.room!.toward).toEqual([0, 1]);
    expect(see.peek!.room!.box.min[0]).toBeLessThanOrEqual(800);
    expect(see.peek!.room!.box.max[1]).toBeGreaterThanOrEqual(1200);
    expect(PEEK.uPeekAt.value.w).toBe(1);
  });

  it('outside keeps only the tube; with no creature cuts nothing', () => {
    const see = new SeeIn(() => [roof]);
    see.update({ id: 'bram', at: [2000, 1000], feet: 0 }, eye, scale);
    expect(see.peek?.room).toBeUndefined();
    expect(see.peek?.radius).toBeGreaterThan(0);
    see.update(undefined, eye, scale);
    expect(see.peek).toBeUndefined();
    expect(PEEK.uPeekAt.value.w).toBe(0);
  });

  it('looks for the roof again only when it moves or the models change', () => {
    let looks = 0;
    const see = new SeeIn(() => (looks++, [roof]));
    const bram = { id: 'bram', at: [1000, 1000] as [number, number], feet: 0 };
    see.update(bram, eye, scale);
    see.update(bram, [0, 1000, 0], scale);
    expect(looks).toBe(1);
    see.forget();
    see.update(bram, eye, scale);
    expect(looks).toBe(2);
  });
});

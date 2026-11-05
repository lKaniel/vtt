import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Sketch } from '../canvas/sketch.ts';
import { Graphics } from 'pixi.js';
import { drape, Marks3D } from './marks3d.ts';

// What the 3D view draws over the surfaces for the pointer and the previews:
// the walk's path laid over what it crosses, rings, areas and the label.

describe('laying a path over what it crosses', () => {
  it('cuts long legs into short steps, each at the height of what is under it', () => {
    const steps = drape(
      [
        [0, 0],
        [100, 0],
      ],
      25,
      (x) => (x >= 50 ? 20 : 0),
    );
    expect(steps.map((p) => p[0])).toEqual([0, 25, 50, 75, 100]);
    expect(steps.map((p) => p[1])).toEqual([0, 0, 20, 20, 20]);
    expect(steps.every((p) => p[2] === 0)).toBe(true);
  });

  it('climbs from where the last step stood', () => {
    const froms: (number | undefined)[] = [];
    drape(
      [
        [0, 0],
        [50, 0],
      ],
      25,
      (_x, _y, from) => (froms.push(from), (from ?? 0) + 10),
    );
    expect(froms).toEqual([undefined, 10, 20]);
  });

  it('keeps every corner of the path', () => {
    const steps = drape(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      25,
      () => 5,
    );
    expect(steps).toEqual([
      [0, 5, 0],
      [10, 5, 0],
      [10, 5, 10],
    ]);
  });
});

describe('the marks', () => {
  const sizes = { grid: 100, heightAt: () => 0 };

  it("draws a preview's line, ring and area, and nothing once it is cleared", () => {
    const marks = new Marks3D();
    const sketch = new Sketch(new Graphics());
    sketch.moveTo(0, 0).lineTo(300, 0).stroke({ width: 6, color: 0xffffff });
    sketch.circle(300, 0, 30).stroke({ width: 6, color: 0xffffff });
    sketch.poly([0, 0, 100, 0, 50, 80]).fill({ color: 0xff9040, alpha: 0.25 });
    marks.preview(sketch, sizes);
    expect(marks.shapeCount).toBe(3);
    sketch.clear();
    marks.preview(sketch, sizes);
    expect(marks.shapeCount).toBe(0);
  });

  it('shows the cursor on the surface under the pointer, never through it', () => {
    const marks = new Marks3D();
    marks.cursor({ point: new THREE.Vector3(100, 20, 200), normal: new THREE.Vector3(0, 1, 0) }, 100);
    expect(marks.cursorMesh.visible).toBe(true);
    expect(marks.cursorMesh.position.y).toBeGreaterThan(20);
    marks.cursor(undefined, 100);
    expect(marks.cursorMesh.visible).toBe(false);
  });

  it('lays the marquee being dragged over the ground, and takes it away after', () => {
    const marks = new Marks3D();
    marks.marquee({ x: 0, y: 0, w: 300, h: 200 }, sizes);
    expect(marks.marqueeShown).toBe(true);
    marks.marquee(undefined, sizes);
    expect(marks.marqueeShown).toBe(false);
  });

  it('marks where a walk goes until the creature gets there', () => {
    const marks = new Marks3D();
    marks.goingTo(new THREE.Vector3(500, 0, 500), 100);
    marks.tick(0.1, [100, 100]);
    expect(marks.destination.visible).toBe(true);
    marks.tick(0.1, [495, 505]);
    expect(marks.destination.visible).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { Doc } from '@vtt/core';
import { sceneSketch } from './scene-picture.ts';

// The picture Claude looks at after building: what is drawn where.

const doc = (id: string, fields: Record<string, unknown>): Doc => ({ id, type: 'x', rev: 0, ...fields });
const scene = doc('s', { gridSize: 100, background: '#000000' });

describe('the scene sketch', () => {
  it('frames everything on the scene with a square round it, and says where creatures are', () => {
    const { png, legend } = sceneSketch(
      {
        scene,
        items: {
          tiles: [
            doc('ground', { kind: 'rect', x: 0, y: 0, w: 1000, h: 500, color: '#336633', background: true }),
            doc('statue', { kind: 'image', x: 100, y: 100, w: 100, h: 100, src: '/s.webp' }),
            doc('trap', { kind: 'rect', x: 300, y: 100, w: 100, h: 100, texture: 'water', hidden: true }),
            doc('g', { kind: 'group' }),
            doc('tower', { kind: 'image', x: 500, y: 100, w: 100, h: 100, src: '/b.svg', model: { src: 't.glb' } }),
          ],
          walls: [
            doc('w', { a: [0, 0], b: [1000, 0] }),
            doc('d', { a: [0, 500], b: [100, 500], door: 'open' }),
            doc('s', { a: [100, 500], b: [200, 500], door: 'closed', secret: true }),
            doc('win', { a: [200, 500], b: [300, 500], sight: 'none' }),
            doc('t', { a: [300, 500], b: [400, 500], sight: 'limited' }),
            doc('e', { a: [400, 500], b: [500, 500], move: 'none' }),
          ],
          lights: [
            doc('l', { x: 500, y: 250, bright: 10, dim: 10, color: '#ff0000' }),
            doc('dk', { x: 800, y: 250, bright: 5, darkness: true }),
          ],
          regions: [
            doc('r', {
              points: [
                [600, 100],
                [700, 100],
                [700, 200],
              ],
            }),
          ],
          notes: [doc('n', { x: 50, y: 450 })],
          sounds: [doc('so', { x: 950, y: 450, radius: 20, src: 'a.ogg' })],
          tokens: [
            doc('gob', { x: 150, y: 350, actor: 'goblin', hidden: true }),
            doc('bram', { x: 250, y: 350, linked: true, name: 'Bram' }),
          ],
        },
        actors: [doc('goblin', { name: 'Goblin', size: 1 })],
      },
      600,
    );
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(600); // 1200 px wide (with the square round it) at half size
    expect(png.readUInt32BE(20)).toBe(350);
    expect(legend).toContain('x -100..1100, y -100..600');
    expect(legend).toContain('- gob "Goblin" at (150, 350) hidden');
    expect(legend).toContain('- bram "Bram" at (250, 350)');
  });

  it('shows an empty scene, or just the part asked for', () => {
    expect(sceneSketch({ scene, items: {}, actors: [] }, 200).legend).toContain('x 0..2000, y 0..2000');
    const part = sceneSketch({ scene, items: {}, actors: [] }, 200, { x: 0, y: 0, w: 400, h: 100 });
    expect(part.png.readUInt32BE(16)).toBe(200);
    expect(part.png.readUInt32BE(20)).toBe(50);
  });
});

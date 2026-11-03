import { describe, expect, it } from 'vitest';
import { Model3DSchema, modelPieces } from './model3d.ts';

// A tile's 3D model (Foundry's 3D Canvas): one model stretched over the tile,
// or repeated across it, standing at its elevation, turned with the tile.

const GRID = { grid: 100, feet: 5 };
const unit = { size: [1, 1, 1] as const };

describe('3D models on tiles', () => {
  it('reads a model with its defaults', () => {
    expect(Model3DSchema.parse({ src: '/assets/bridge.glb' })).toEqual({ src: '/assets/bridge.glb' });
    expect(Model3DSchema.safeParse({ src: '' }).success).toBe(false);
  });

  it('stretches one model over the tile, as tall as asked, from its elevation up', () => {
    const rect = { x: 100, y: 200, w: 400, h: 200 };
    const [piece, ...rest] = modelPieces(
      rect,
      { src: 'm.glb', height: 10, elevation: 5, rotation: 90 },
      { ...GRID, floor: 0 },
      unit,
    );
    expect(rest).toEqual([]);
    expect(piece).toEqual({ at: [300, 300], base: 100, scale: [400, 200, 200], yaw: -Math.PI / 2, tilt: [0, 0] });
  });

  it('keeps the model in proportion when no height is given, standing on the floor shown', () => {
    const rect = { x: 0, y: 0, w: 200, h: 100 };
    const [piece] = modelPieces(rect, { src: 'm.glb', elevation: 12 }, { ...GRID, floor: 10 }, { size: [2, 4, 1] });
    expect(piece!.scale).toEqual([100, 100, 100]);
    expect(piece!.base).toBeCloseTo(40);
  });

  it('fits a figure in proportion: as tall as asked, else as wide as its square', () => {
    const rect = { x: 0, y: 0, w: 100, h: 100 };
    const man = { size: [0.5, 1.5, 0.25] as const };
    const [tall] = modelPieces(rect, { src: 'man.glb', fill: 'fit', height: 6 }, { ...GRID, floor: 0 }, man);
    expect(tall!.scale).toEqual([80, 80, 80]);
    const [wide] = modelPieces(rect, { src: 'man.glb', fill: 'fit' }, { ...GRID, floor: 0 }, man);
    expect(wide!.scale).toEqual([200, 200, 200]);
  });

  it('repeats a tiling model, one piece every `piece` squares', () => {
    const rect = { x: 0, y: 0, w: 400, h: 200 };
    const pieces = modelPieces(rect, { src: 'floor.glb', fill: 'tile', piece: 2 }, { ...GRID, floor: 0 }, unit);
    expect(pieces.map((p) => p.at)).toEqual([
      [100, 100],
      [300, 100],
    ]);
    expect(pieces[0]!.scale).toEqual([200, 200, 200]);
  });

  it('turns the repeated pieces round the middle of the tile with it', () => {
    const rect = { x: 0, y: 0, w: 400, h: 200 };
    const pieces = modelPieces(
      rect,
      { src: 'wall.glb', fill: 'tile', piece: 2, rotation: 90 },
      { ...GRID, floor: 0 },
      unit,
    );
    const [a, b] = pieces.map((p) => p.at);
    expect(a![0]).toBeCloseTo(200);
    expect(a![1]).toBeCloseTo(0);
    expect(b![0]).toBeCloseTo(200);
    expect(b![1]).toBeCloseTo(200);
  });
});

describe('3D in the game files', () => {
  it('keeps a model on an image tile and the 3D settings of a scene', async () => {
    const { TileSchema, SceneSettingsSchema } = await import('./schema.ts');
    const tile = TileSchema.parse({
      id: 't',
      kind: 'image',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      src: 'a.webp',
      model: { src: 'b.glb' },
    });
    expect(tile.kind === 'image' && tile.model).toEqual({ src: 'b.glb' });
    const scene = SceneSettingsSchema.parse({ view3d: { sky: 'sky.webp', walls: false } });
    expect(scene.view3d).toEqual({ sky: 'sky.webp', walls: false });
  });
});

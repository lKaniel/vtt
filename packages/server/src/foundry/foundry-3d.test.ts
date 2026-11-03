import { describe, expect, it } from 'vitest';
import { scene3dOf, tileModelOf, tileSolidOf, tokenModelOf } from './foundry-3d.ts';

// 3D Canvas (levels-3d-preview) keeps its models in flags: a tile's model,
// its height (`depth`, pixels), tilt and fill; a token's figure; a scene's
// sky and table. They become our `model` and `view3d` (docs/view3d.md).

const find = (path: string) => (path.startsWith('modules/') ? `/assets/foundry/${path}` : undefined);
const grid = { size: 100, distance: 5 };
const flags = (f: object) => ({ flags: { 'levels-3d-preview': f } });

describe('3D Canvas models', () => {
  it('turns a model tile into a model as tall as its depth, at its elevation, turned with the tile', () => {
    const tile = {
      rotation: 64,
      elevation: 45,
      ...flags({
        model3d: 'modules/baileywiki-3d/models/bridge.glb',
        depth: 160,
        tiltX: 0,
        tiltZ: 10,
        color: '#ffffff',
        fillType: 'stretch',
      }),
    };
    expect(tileModelOf(tile, grid, find)).toEqual({
      src: '/assets/foundry/modules/baileywiki-3d/models/bridge.glb',
      elevation: 45,
      height: 8,
      rotation: 64,
      tilt: [0, 10],
    });
  });

  it('repeats a tiling model every tileScale squares, in proportion, tinted', () => {
    const tile = flags({
      model3d: 'modules/kit/floor.glb',
      fillType: 'tile',
      tileScale: 2,
      depth: 25,
      color: '#aa8866',
    });
    expect(tileModelOf(tile, grid, find)).toEqual({
      src: '/assets/foundry/modules/kit/floor.glb',
      fill: 'tile',
      piece: 2,
      color: '#aa8866',
    });
  });

  it('leaves out drawn shapes and models whose file is missing', () => {
    expect(tileModelOf(flags({ model3d: '0,0,100,0,100,100' }), grid, find)).toBeUndefined();
    expect(tileModelOf(flags({ model3d: 'worlds/x/gone.glb' }), grid, find)).toBeUndefined();
    expect(tileModelOf({}, grid, find)).toBeUndefined();
  });

  it('raises a drawn polygon as a solid over the tile, as tall as its depth', () => {
    const cliff = {
      rotation: 30,
      elevation: 10,
      ...flags({ model3d: '10#0,0,200,0,200,100,0,100', dynaMesh: 'polygonbevel', depth: 200, color: '#1e7000' }),
    };
    expect(tileSolidOf(cliff, grid)).toEqual({
      points: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      height: 10,
      elevation: 10,
      rotation: 30,
      color: '#1e7000',
    });
    const box = tileSolidOf(flags({ model3d: '', dynaMesh: 'box', depth: 100 }), grid);
    expect(box).toEqual({
      points: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      height: 5,
    });
    const round = tileSolidOf(flags({ model3d: '', dynaMesh: 'cylinder', depth: 100 }), grid);
    expect(round?.points).toHaveLength(24);
    expect(round?.points[0]).toEqual([1, 0.5]);
    expect(tileSolidOf(flags({ model3d: '0,0,10,10', dynaMesh: 'polygon', depth: 50 }), grid)).toBeUndefined();
    expect(tileSolidOf(flags({ model3d: '', dynaMesh: 'cone', depth: 50 }), grid)).toBeUndefined();
    expect(tileSolidOf(flags({ model3d: 'a.glb', dynaMesh: 'default' }), grid)).toBeUndefined();
  });

  it('gives a token its figure, but not HeroForge links', () => {
    expect(tokenModelOf(flags({ model3d: 'modules/minis/orc.glb', scale: 1.5 }), find)).toEqual({
      src: '/assets/foundry/modules/minis/orc.glb',
    });
    expect(tokenModelOf(flags({ model3d: '[HeroForge]{Knight}{123}' }), find)).toBeUndefined();
    expect(tokenModelOf(flags({ model3d: ['', ''] }), find)).toBeUndefined();
  });

  it("keeps a scene's sky, table colour and whether its walls stand", () => {
    const scene = flags({ exr: 'modules/c3d/sky/day.webp', tableColor: '#341f0f', showSceneWalls: false });
    expect(scene3dOf(scene, find)).toEqual({
      sky: '/assets/foundry/modules/c3d/sky/day.webp',
      ground: '#341f0f',
      walls: false,
    });
    expect(scene3dOf({}, find)).toBeUndefined();
  });
});

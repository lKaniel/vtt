import { describe, expect, it } from 'vitest';
import { scene3dOf, tileModelOf, tokenModelOf } from './foundry-3d.ts';

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

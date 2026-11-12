import { describe, expect, it } from 'vitest';
import { PrefabSchema } from '@vtt/shared';
import { presetOf, prefabOf } from './baileywiki-prefabs.ts';

// Baileywiki's prefabs are Mass Edit presets: journal entries whose
// flags['multi-token-edit'].preset holds the documents to spawn.

const media = (path: string) => `pack://baileywiki/media/${path.replace(/^\/+/, '')}`;

const journal = (preset: object, extra: object = {}) => ({
  _id: 'J1',
  name: 'x',
  flags: { 'multi-token-edit': { preset: { id: 'J1', addSubtract: [], randomize: [], ...preset } } },
  ...extra,
});

const lamppost = journal({
  name: 'LIGHTING Street Lamppost',
  documentName: 'Tile',
  gridSize: 100,
  img: 'modules/bw/maps/lamp-thumb.webp',
  tags: ['lighting', 'town'],
  data: [
    { texture: { src: 'modules/bw/maps/lamp-base.webp' }, x: 3050, y: 1750, width: 200, height: 200, rotation: 180 },
  ],
  attached: [
    {
      documentName: 'AmbientLight',
      data: { x: 3149, y: 1915, config: { bright: 17.2, dim: 34.4, color: '#ef8c01', animation: { type: 'torch' } } },
    },
    {
      documentName: 'Tile',
      data: { texture: { src: 'modules/bw/maps/lamp-top.webp' }, x: 3050, y: 1750, width: 200, height: 200 },
    },
    { documentName: 'Wall', data: { c: [3050, 1750, 3250, 1750], move: 20, sight: 20 } },
    { documentName: 'AmbientSound', data: { x: 3150, y: 1850, radius: 20, path: 'modules/bw/sounds/hum.ogg' } },
  ],
});

describe('Mass Edit presets as prefabs', () => {
  it('finds the preset of a journal entry, and nothing in a plain one', () => {
    expect(presetOf(lamppost)?.name).toBe('LIGHTING Street Lamppost');
    expect(presetOf({ _id: 'x', name: 'Notes', pages: [] })).toBeUndefined();
  });

  it('brings a tile preset with what is attached to it, in feet, with its tags and thumbnail', () => {
    const p = PrefabSchema.parse({ id: 'lamp', ...prefabOf(presetOf(lamppost)!, media) });
    expect(p.name).toBe('LIGHTING Street Lamppost');
    expect(p.tags).toEqual(['lighting', 'town']);
    expect(p.thumb).toBe('pack://baileywiki/media/modules/bw/maps/lamp-thumb.webp');
    expect(p.tiles.map((t) => (t.kind === 'image' ? t.src : ''))).toEqual([
      'pack://baileywiki/media/modules/bw/maps/lamp-base.webp',
      'pack://baileywiki/media/modules/bw/maps/lamp-top.webp',
    ]);
    expect(p.tiles[0]).toMatchObject({ x: 3050, y: 1750, w: 200, h: 200, rotation: 180 });
    expect(p.lights).toEqual([expect.objectContaining({ x: 3149, y: 1915, bright: 17, dim: 34, color: '#ef8c01' })]);
    expect(p.walls).toEqual([expect.objectContaining({ a: [3050, 1750], b: [3250, 1750] })]);
    expect(p.sounds).toEqual([expect.objectContaining({ src: 'pack://baileywiki/media/modules/bw/sounds/hum.ogg' })]);
  });

  it('shows its first picture when it has no thumbnail of its own', () => {
    const { img: _img, ...bare } = lamppost.flags['multi-token-edit'].preset as Record<string, unknown>;
    const p = prefabOf(presetOf(journal(bare))!, media);
    expect(p?.thumb).toBe('pack://baileywiki/media/modules/bw/maps/lamp-base.webp');
  });

  it('makes a brush of a preset that spawns one of its tiles at random, and keeps how it varies', () => {
    const brush = journal({
      name: 'Brush: Stalagmites',
      documentName: 'Tile',
      spawnRandom: true,
      data: [1, 2, 3].map((n) => ({
        texture: { src: `modules/bw/maps/stalagmite-${n}.webp` },
        x: n * 100,
        y: 0,
        width: 100,
        height: 100,
      })),
      randomize: [
        ['massedit.scale', { type: 'number', method: 'random', min: 0.9, max: 2.7, step: 0.1 }],
        ['rotation', { type: 'number', method: 'random', min: 0, max: 45, step: 1 }],
        [
          'texture.tint',
          {
            type: 'color',
            method: 'random',
            colors: [
              { hex: '#cfd4ab', offset: 0 },
              { hex: '#745a11', offset: 100 },
            ],
          },
        ],
        [
          'texture.src',
          { type: 'image', method: 'random', images: ['modules/bw/maps/bush-1.webp', 'modules/bw/maps/bush-2.webp'] },
        ],
        ['flags.levels.rangeBottom', { type: 'number', method: 'random', min: 10, max: 30 }],
      ],
    });
    const p = prefabOf(presetOf(brush)!, media)!;
    expect(p.pick).toBe('one');
    expect(p.tiles).toHaveLength(3);
    expect(p.vary).toEqual({
      scale: [0.9, 2.7],
      rotation: [0, 45],
      tint: ['#cfd4ab', '#745a11'],
      pictures: [
        'pack://baileywiki/media/modules/bw/maps/bush-1.webp',
        'pack://baileywiki/media/modules/bw/maps/bush-2.webp',
      ],
    });
  });

  it('covers the scene with one whose script stretches it over the scene', () => {
    const fog = journal({
      name: 'Unlimited Fog',
      documentName: 'Tile',
      data: [{ texture: { src: 'modules/bw/fx/fog.webm' }, x: 0, y: 0, width: 500, height: 500 }],
      postSpawnScript:
        'objects[0].document.update({\n  x: canvas.dimensions.sceneX,\n  width: canvas.dimensions.sceneWidth,\n});',
    });
    expect(prefabOf(presetOf(fog)!, media)?.fill).toBe(true);
  });

  it('opens a 3D prefab: a Token Attacher handle token with model tiles attached, the handle left out', () => {
    const road = journal({
      name: 'Road End Left',
      documentName: 'Token',
      img: 'modules/baileywiki-3d/thumbnails/road.webp',
      data: [
        {
          name: 'Road End Left',
          texture: { src: 'modules/baileywiki-3d/thumbnails/road.webp' },
          x: 3200,
          y: 1300,
          width: 1,
          height: 1,
          flags: {
            'token-attacher': {
              prototypeAttached: {
                Tile: [
                  {
                    x: 2900,
                    y: 2000,
                    width: 200,
                    height: 200,
                    texture: { src: 'modules/levels-3d-preview/assets/blank.webp' },
                    flags: {
                      'levels-3d-preview': {
                        model3d: 'modules/baileywiki-3d/models/street/bricks-2x2.glb',
                        depth: 25,
                        autoGround: true,
                      },
                    },
                  },
                ],
                Wall: [{ c: [2900, 2000, 3100, 2000] }],
              },
            },
          },
        },
      ],
    });
    const p = PrefabSchema.parse({ id: 'road', ...prefabOf(presetOf(road)!, media) });
    expect(p.tiles).toHaveLength(1);
    expect(p.tiles[0]).toMatchObject({
      x: 2900,
      y: 2000,
      model: { src: 'pack://baileywiki/media/modules/baileywiki-3d/models/street/bricks-2x2.glb' },
    });
    expect(p.walls).toHaveLength(1);
  });

  it('turns a scenery token (a tree with no attachments) into a tile', () => {
    const tree = journal({
      name: 'Oak',
      documentName: 'Token',
      data: [{ name: 'Oak', texture: { src: 'modules/bw/maps/trees/oak.webp' }, x: 0, y: 0, width: 3, height: 3 }],
    });
    const p = prefabOf(presetOf(tree)!, media, 100)!;
    expect(p.tiles).toEqual([
      expect.objectContaining({ w: 300, h: 300, src: 'pack://baileywiki/media/modules/bw/maps/trees/oak.webp' }),
    ]);
  });

  it('gives nothing for a preset with nothing we can place (a scene browser entry)', () => {
    const faux = journal({ name: 'Docks', documentName: 'FauxScene', data: [{ uuid: 'Compendium.bw.maps.Scene.x' }] });
    expect(prefabOf(presetOf(faux)!, media)).toBeUndefined();
  });
});

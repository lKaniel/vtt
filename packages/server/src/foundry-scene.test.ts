import { SceneEntrySchema } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { foundryScene } from './foundry-scene.ts';

// Media the import copied, by their path in the Foundry data folder.
const media = (path: string) =>
  ['modules/caves/maps/goblin cave.webp', 'modules/caves/tiles/barrel.png'].includes(path)
    ? `pack://caves/media/${path.slice('modules/caves/'.length)}`
    : undefined;

// A v11 scene: 4000 x 3000 px, 200 px squares of 5 ft, 25% padding.
const v11 = {
  _id: 'AbC123',
  name: 'Goblin Cave',
  width: 4000,
  height: 3000,
  padding: 0.25,
  background: { src: 'modules/caves/maps/goblin%20cave.webp' },
  backgroundColor: '#101010',
  grid: { size: 200, type: 1, distance: 5 },
  darkness: 0.7,
  walls: [
    {
      _id: 'w1',
      c: [1000, 800, 1400, 800],
      move: 20,
      sight: 20,
      door: 0,
      ds: 0,
      flags: { 'wall-height': { top: 10, bottom: null } },
    },
    { _id: 'w2', c: [1400, 800, 1400, 1000], move: 20, sight: 20, door: 1, ds: 2 },
    { _id: 'w3', c: [1400, 1000, 1600, 1000], move: 20, sight: 0, door: 0 },
    { _id: 'w4', c: [1600, 1000, 1800, 1000], move: 0, sight: 0, sound: 20 },
    { _id: 'w5', c: [1800, 1000, 2000, 1000], move: 0, sight: 0, light: 0, sound: 0 },
    { _id: 'w6', c: [2000, 1000, 2200, 1000], move: 20, sight: 10, light: 30, sound: 0, threshold: { light: 10 } },
    { _id: 'w7', c: [2200, 1000, 2400, 1000], dir: 2, door: 2, ds: 0, doorSound: 'ironBasic' },
  ],
  lights: [
    { _id: 'l1', x: 1100, y: 900, config: { bright: 20, dim: 40, color: '#ff9a40', animation: { type: 'torch' } } },
    { _id: 'l2', x: 1200, y: 900, config: { bright: 0, dim: 0 } },
  ],
  tiles: [
    {
      _id: 't2',
      texture: { src: 'modules/caves/tiles/barrel.png' },
      x: 1200,
      y: 1000,
      width: 200,
      height: 200,
      sort: 2,
    },
    { _id: 't1', texture: { src: 'icons/svg/mystery-man.svg' }, x: 0, y: 0, width: 100, height: 100, sort: 1 },
  ],
  tokens: [{ _id: 'tok', name: 'Goblin' }],
};

describe('a Foundry scene', () => {
  it('becomes a scene with its background as a locked ground tile, where Foundry draws it', () => {
    const { scene } = foundryScene(v11, media);
    expect(SceneEntrySchema.parse({ id: 'goblin-cave', ...scene })).toMatchObject({
      name: 'Goblin Cave',
      gridSize: 200,
      chunkSize: 2000,
      darkness: 0.7,
      background: '#101010',
      start: [3000, 2300],
    });
    // Padding is a whole number of squares: 1000 px across, 800 px down.
    expect(scene.tiles[0]).toEqual({
      id: 'background',
      name: 'Background',
      kind: 'image',
      x: 1000,
      y: 800,
      w: 4000,
      h: 3000,
      src: 'pack://caves/media/maps/goblin cave.webp',
      background: true,
      locked: true,
    });
  });

  it('keeps the navigation bar settings, the thumbnail and the foreground picture (as a roof that never fades)', () => {
    const lookup = (p: string) => `pack://caves/${p}`;
    const data = {
      ...v11,
      navigation: true,
      navName: 'Cave',
      thumb: 'worlds/w/thumbs/cave.webp',
      foreground: 'f.webp',
    };
    const { scene } = foundryScene(data, lookup);
    expect(scene).toMatchObject({ navigation: true, navName: 'Cave', thumb: 'pack://caves/worlds/w/thumbs/cave.webp' });
    expect(scene.tiles.find((t) => t.id === 'foreground')).toEqual({
      id: 'foreground',
      name: 'Foreground',
      kind: 'image',
      x: 1000,
      y: 800,
      w: 4000,
      h: 3000,
      src: 'pack://caves/f.webp',
      overhead: true,
      occludedAlpha: 1,
      locked: true,
    });
    expect(foundryScene({ ...v11, navigation: false }, media).scene).not.toHaveProperty('navigation');
  });

  it('makes roofs of overhead, roof and Better Roofs tiles, and keeps videos', () => {
    const tile = { texture: { src: 'modules/caves/tiles/barrel.png' }, x: 0, y: 0, width: 100, height: 100 };
    const roofs = {
      ...v11,
      foregroundElevation: 20,
      tiles: [
        { ...tile, overhead: true, occlusion: { mode: 1, alpha: 0.3 } },
        { ...tile, flags: { betterroofs: { brMode: 2 } } },
        { ...tile, elevation: 20, occlusion: { modes: [2], alpha: 0 } },
        { ...tile, elevation: 0 },
        { ...tile, texture: { src: 'modules/caves/tiles/river.webm' } },
      ],
    };
    const tiles = foundryScene(roofs, (p) => `pack://caves/${p}`).scene.tiles.slice(1);
    expect(
      tiles.map((t) => [('overhead' in t && t.overhead) ?? false, 'occludedAlpha' in t && t.occludedAlpha]),
    ).toEqual([
      [false, false],
      [false, false],
      [true, 0.3],
      [true, false],
      [true, false],
    ]);
    expect(tiles.map((t) => 'src' in t && t.src)).toContain('pack://caves/modules/caves/tiles/river.webm');
  });

  it('keeps tiles whose picture came along, in Foundry’s order', () => {
    const { scene, skipped } = foundryScene(v11, media);
    expect(scene.tiles.slice(1)).toEqual([
      { id: 'tile-1', kind: 'image', x: 1200, y: 1000, w: 200, h: 200, src: 'pack://caves/media/tiles/barrel.png' },
    ]);
    expect(skipped).toContain('1 tile whose picture is not in the module (icons/svg/mystery-man.svg)');
  });

  it('turns walls, doors and windows into ours with what each one stops, leaving out walls that stop nothing', () => {
    const { scene, skipped } = foundryScene(v11, media);
    expect(scene.walls).toEqual([
      { id: 'wall-1', a: [1000, 800], b: [1400, 800], height: { top: 10 } },
      { id: 'wall-2', a: [1400, 800], b: [1400, 1000], door: 'locked' },
      { id: 'wall-3', a: [1400, 1000], b: [1600, 1000], sight: 'none', light: 'none' },
      { id: 'wall-4', a: [1600, 1000], b: [1800, 1000], move: 'none', sight: 'none', light: 'none' },
      {
        id: 'wall-5',
        a: [2000, 1000],
        b: [2200, 1000],
        sight: 'limited',
        light: 'proximity',
        sound: 'none',
        threshold: { light: 10 },
      },
      {
        id: 'wall-6',
        a: [2200, 1000],
        b: [2400, 1000],
        door: 'closed',
        secret: true,
        dir: 'right',
        doorSound: 'iron',
      },
    ]);
    expect(skipped).toContain('1 wall that stops nothing');
    expect(skipped).toContain('1 token (place the creatures from the Actors tab)');
  });

  it('turns lights into ours, in feet', () => {
    const { scene } = foundryScene(v11, media);
    expect(scene.lights).toEqual([
      { id: 'light-1', x: 1100, y: 900, bright: 20, dim: 40, color: '#ff9a40', animation: 'flicker' },
    ]);
  });

  it('keeps a light’s beam, strength, softness, colour strength and whether walls stop it', () => {
    const lantern = {
      ...v11,
      lights: [
        {
          x: 0,
          y: 0,
          rotation: 90,
          walls: false,
          config: { bright: 20, dim: 0, color: '#3060ff', angle: 60, luminosity: 0.25, attenuation: 0.8, alpha: 0.2 },
        },
        { x: 0, y: 0, config: { bright: 20, dim: 0, angle: 360, luminosity: 0.5, attenuation: 0.5, alpha: 0.5 } },
      ],
    };
    expect(foundryScene(lantern, media).scene.lights).toEqual([
      {
        id: 'light-1',
        x: 0,
        y: 0,
        bright: 20,
        dim: 0,
        color: '#3060ff',
        angle: 60,
        rotation: 90,
        walls: false,
        luminosity: 0.5,
        attenuation: 0.8,
        colorIntensity: 0.4,
      },
      { id: 'light-2', x: 0, y: 0, bright: 20, dim: 0 },
    ]);
  });

  it('reads the older (v9) fields too, and scales lights from other grid units', () => {
    const v9 = {
      name: 'Old Keep',
      width: 1000,
      height: 1000,
      img: 'modules/caves/maps/goblin cave.webp',
      grid: 100,
      gridType: 0,
      gridDistance: 10,
      walls: [{ c: [0, 0, 100, 0], move: 1, sense: 0, door: 2, ds: 1 }],
      lights: [{ x: 50, y: 50, bright: 10, dim: 20, tintColor: '#ffffff', lightAnimation: { type: 'pulse' } }],
    };
    const { scene } = foundryScene(v9, media);
    expect(scene).toMatchObject({ gridSize: 100, grid: 'none', darkness: 0 });
    expect(scene.tiles[0]).toMatchObject({ x: 300, y: 300 });
    expect(scene.walls).toEqual([
      { id: 'wall-1', a: [0, 0], b: [100, 0], door: 'open', secret: true, sight: 'none', light: 'none' },
    ]);
    expect(scene.lights).toEqual([
      { id: 'light-1', x: 50, y: 50, bright: 5, dim: 10, color: '#ffffff', animation: 'pulse' },
    ]);
  });

  it('reads the v12 darkness level', () => {
    expect(
      foundryScene({ ...v11, darkness: undefined, environment: { darknessLevel: 0.4 } }, media).scene.darkness,
    ).toBeCloseTo(0.4);
  });
});

describe('Foundry v14 scenes', () => {
  const v14 = {
    name: 'Market',
    width: 2000,
    height: 1000,
    padding: 0,
    grid: { size: 100, type: 1, distance: 5 },
    levels: [
      {
        _id: 'up',
        name: 'Upstairs',
        elevation: { bottom: 10, top: 20 },
        background: { src: 'modules/caves/tiles/barrel.png' },
      },
      {
        _id: 'gr',
        name: 'Ground',
        elevation: { bottom: 0, top: 10 },
        background: { src: 'modules/caves/maps/goblin cave.webp' },
      },
    ],
    tiles: [
      { texture: { src: 'modules/levels-3d-preview/assets/blank.webp' }, x: 0, y: 0, width: 100, height: 100 },
      { texture: { src: 'modules/levels-3d-preview/assets/blank.webp' }, x: 100, y: 0, width: 100, height: 100 },
      { texture: { src: 'modules/caves/tiles/barrel.png' }, x: 200, y: 0, width: 100, height: 100 },
    ],
  };

  it('takes the background from the lowest floor that has one', () => {
    const { scene } = foundryScene(v14, media);
    expect(scene.tiles[0]).toMatchObject({ id: 'background', src: 'pack://caves/media/maps/goblin cave.webp' });
  });

  it('leaves out 3D Canvas model tiles, which are blank squares in 2D', () => {
    const { scene, skipped } = foundryScene(v14, media);
    expect(scene.tiles.map((t) => ('src' in t ? t.src : undefined))).toEqual([
      'pack://caves/media/maps/goblin cave.webp',
      'pack://caves/media/tiles/barrel.png',
    ]);
    expect(skipped).toContain('2 3D Canvas model tiles (3D only, they show as blank squares)');
  });
});

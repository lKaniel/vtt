import { describe, expect, it } from 'vitest';
import { foundryScene } from './foundry-scene.ts';

// 3D Canvas door models (doorType on a model tile): a door, a chest, a rug
// over a trapdoor, a drawbridge. Each becomes a door wall through the tile's
// long middle, which opens, locks, sounds and blocks as doors do, and the
// tile's model moves with it.

const door = (id: string, f: object, more: object = {}) => ({
  _id: id,
  texture: { src: 'modules/levels-3d-preview/assets/blank.webp' },
  x: 1000,
  y: 500,
  width: 200,
  height: 40,
  elevation: 10,
  flags: { 'levels-3d-preview': { model3d: `modules/m/${id}.glb`, depth: 160, doorType: '1', ...f } },
  ...more,
});

const scene = (...tiles: object[]) => ({
  name: 'Keep',
  width: 3000,
  height: 3000,
  padding: 0,
  grid: { size: 100, distance: 5 },
  tiles,
});

const find = (p: string) => `/assets/foundry/${p}`;

describe('3D Canvas door models', () => {
  it('become a door wall along the tile and a model that swings with it', () => {
    const tiles = [door('gate-door', { doorStyle: '1', doorState: '0', doorAnimateAngle: 44, doorSound: 'woodBasic' })];
    const { scene: s } = foundryScene(scene(...tiles), find);
    const wall = s.walls.find((w) => w.door);
    expect(wall).toMatchObject({
      a: [1000, 520],
      b: [1200, 520],
      door: 'closed',
      doorSound: 'wood',
      name: 'Gate door',
      height: { bottom: 10, top: 18 },
    });
    const tile = s.tiles.find((t) => 'door' in t && t.door);
    expect(tile).toMatchObject({ door: { wall: wall!.id, style: 'swing', angle: 44, ms: 400 } });
  });

  it('keeps its state, its secret, its turn and how it moves', () => {
    const tiles = [
      door(
        'chest-01',
        { doorStyle: '3', doorState: '1', doorSlidePercent: 70 },
        { width: 80, height: 60, rotation: 90 },
      ),
      door('rug', { doorStyle: '2', doorState: '2', doorType: '2', doorAnimateAngle: 126, doorSlidePercent: 70 }),
      door('drawbridge', { doorStyle: '5', doorAnimationDuration: 8000, collision: false, sight: false }),
      door('curtain', {}),
    ];
    const { scene: s } = foundryScene(scene(...tiles), find);
    const doors = s.walls.filter((w) => w.door);
    expect(doors.map((w) => [w.door, w.secret ?? false])).toEqual([
      ['open', false],
      ['locked', true],
      ['closed', false],
      ['closed', false],
    ]);
    // Turned a quarter, the chest's long side runs north to south.
    expect(doors[0]).toMatchObject({ a: [1040, 490], b: [1040, 570] });
    expect(doors[2]).toMatchObject({ move: 'none', sight: 'none' });
    const looks = s.tiles.flatMap((t) => ('door' in t && t.door ? [t.door] : []));
    expect(looks).toMatchObject([
      { style: 'lift', slide: 70 },
      { style: 'slide', angle: 126, slide: 70 },
      { style: 'rewind', ms: 8000 },
      { style: 'fade' },
    ]);
  });
});

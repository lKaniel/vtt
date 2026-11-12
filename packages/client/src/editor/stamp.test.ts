import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, footprint, scatterPoints, stampDoc, stampPoint, type StampAsset } from './stamp.ts';

const picture: StampAsset = { src: 'pack://bw/props/barrel.webp', kind: 'image', size: [100, 200] };
const model: StampAsset = { src: '/assets/tent.glb', kind: 'model', size: [2, 1.5, 3] };
const still = () => 0.5;

describe('footprint', () => {
  it('draws a picture made for 100 px squares at the scene squares', () => {
    expect(footprint(picture, DEFAULT_LOOK, 140)).toEqual({ w: 140, h: 280 });
    expect(footprint(picture, { ...DEFAULT_LOOK, scale: 0.5 }, 100)).toEqual({ w: 50, h: 100 });
  });

  it('stands a model at its real size, one unit five feet, with its height', () => {
    expect(footprint(model, DEFAULT_LOOK, 100)).toEqual({ w: 200, h: 300, height: 7.5 });
    expect(footprint(model, { ...DEFAULT_LOOK, scale: 2 }, 50)).toEqual({ w: 200, h: 300, height: 15 });
  });

  it('gives a file of unknown size two squares', () => {
    expect(footprint({ src: '/assets/x.glb', kind: 'model' }, DEFAULT_LOOK, 100)).toEqual({ w: 200, h: 200 });
    expect(footprint({ src: '/assets/x.png', kind: 'image' }, DEFAULT_LOOK, 100)).toEqual({ w: 200, h: 200 });
  });
});

describe('stampDoc', () => {
  it('centres a picture on the spot, turned', () => {
    const doc = stampDoc(picture, { ...DEFAULT_LOOK, turn: 90 }, [500, 500], { grid: 100, random: still });
    expect(doc).toEqual({ x: 450, y: 400, w: 100, h: 200, src: picture.src, rotation: 90 });
  });

  it('turns a model and its tile, and sets its height', () => {
    const doc = stampDoc(model, { ...DEFAULT_LOOK, turn: 45 }, [500, 500], { grid: 100, random: still });
    expect(doc).toEqual({
      x: 400,
      y: 350,
      w: 200,
      h: 300,
      src: '/art/ui/blank.svg',
      rotation: 45,
      model: { src: model.src, height: 7.5, rotation: 45 },
    });
  });

  it('leaves out a turn of nothing', () => {
    expect(stampDoc(picture, DEFAULT_LOOK, [50, 100], { grid: 100, random: still })).not.toHaveProperty('rotation');
  });

  it('picks a turn and a size at random when asked', () => {
    const look = { ...DEFAULT_LOOK, randomTurn: true, randomSize: 0.2 };
    const low = stampDoc(picture, look, [500, 500], { grid: 100, random: () => 0 });
    const high = stampDoc(picture, look, [500, 500], { grid: 100, random: () => 0.999 });
    expect(low).toMatchObject({ w: 80, h: 160 });
    expect(low).not.toHaveProperty('rotation');
    expect(high).toMatchObject({ w: 120, h: 240 });
    expect(high.rotation).toBeCloseTo(359.64);
  });

  it('turns at random from the turn picked', () => {
    const look = { ...DEFAULT_LOOK, turn: 90, randomTurn: true };
    expect(stampDoc(picture, look, [0, 0], { grid: 100, random: () => 0.5 }).rotation).toBe(270);
  });
});

describe('stampPoint', () => {
  it('snaps to half squares, unless free', () => {
    expect(stampPoint([137, 262], 100, false)).toEqual([150, 250]);
    expect(stampPoint([137, 262], 100, true)).toEqual([137, 262]);
  });
});

describe('scatterPoints', () => {
  it('lays a stamp every `spacing` pixels along the stroke, from its start', () => {
    expect(
      scatterPoints(
        [
          [0, 0],
          [250, 0],
        ],
        100,
      ),
    ).toEqual([
      [0, 0],
      [100, 0],
      [200, 0],
    ]);
  });

  it('keeps the spacing round corners', () => {
    expect(
      scatterPoints(
        [
          [0, 0],
          [60, 0],
          [60, 80],
        ],
        70,
      ),
    ).toEqual([
      [0, 0],
      [60, 10],
      [60, 80],
    ]);
  });

  it('is the one spot for a click', () => {
    expect(scatterPoints([[5, 5]], 100)).toEqual([[5, 5]]);
  });
});

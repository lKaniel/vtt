import { describe, expect, it } from 'vitest';
import { areaShape, inArea } from './areas.ts';
import type { Area } from './spell-schema.ts';

const G = 100;
const area = (shape: Area['shape'], size: number, width = 5): Area => ({ shape, size, width });
const caster = { x: 50, y: 50, size: 1 };
/** A medium token on the square `col` squares east and `row` squares south of the caster. */
const at = (col: number, row = 0) => ({ x: 50 + col * G, y: 50 + row * G, size: 1 });

describe('spell areas', () => {
  it('puts a sphere around the aimed point', () => {
    const fireball = { area: area('sphere', 20), range: 150 };
    const aim: [number, number] = [550, 50];
    expect(inArea(fireball, { caster, aim, token: at(5), gridSize: G })).toBe(true);
    expect(inArea(fireball, { caster, aim, token: at(9), gridSize: G })).toBe(true);
    expect(inArea(fireball, { caster, aim, token: at(10), gridSize: G })).toBe(false);
  });

  it('spreads a cone from the caster as wide as it is long', () => {
    const hands = { area: area('cone', 15), range: 0 };
    const aim: [number, number] = [450, 50];
    const hit = (t: ReturnType<typeof at>) => inArea(hands, { caster, aim, token: t, gridSize: G });
    expect([at(1), at(3), at(3, 1), at(4), at(1, 2), at(-1)].map(hit)).toEqual([true, true, true, false, false, false]);
    expect(hit(caster)).toBe(false);
  });

  it('runs a line from the caster', () => {
    const bolt = { area: area('line', 100, 5), range: 0 };
    const aim: [number, number] = [50, 1050];
    expect(inArea(bolt, { caster, aim, token: at(0, 19), gridSize: G })).toBe(true);
    expect(inArea(bolt, { caster, aim, token: at(1, 5), gridSize: G })).toBe(false);
  });

  it('puts a self cube next to the caster, and a ranged cube on the point', () => {
    const wave = { area: area('cube', 15), range: 0 };
    const aim: [number, number] = [400, 50];
    expect(inArea(wave, { caster, aim, token: at(3, 1), gridSize: G })).toBe(true);
    expect(inArea(wave, { caster, aim, token: at(-1), gridSize: G })).toBe(false);
    const fire = { area: area('cube', 20), range: 60 };
    expect(inArea(fire, { caster, aim: [550, 550], token: at(4, 4), gridSize: G })).toBe(true);
  });

  it('gives the client a shape to draw', () => {
    expect(areaShape({ area: area('sphere', 20), range: 150 }, { caster, aim: [0, 0], gridSize: G })).toEqual({
      kind: 'circle',
      center: [0, 0],
      radius: 400,
    });
    const cone = areaShape({ area: area('cone', 15), range: 0 }, { caster, aim: [450, 50], gridSize: G });
    expect(cone).toEqual({
      kind: 'polygon',
      points: [
        [50, 50],
        [350, -100],
        [350, 200],
      ],
    });
  });
});

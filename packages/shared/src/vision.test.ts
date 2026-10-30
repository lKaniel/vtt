import { describe, expect, it } from 'vitest';
import { pointInPolygon, tokensVisibleTo, TokenSchema, visibilityPolygon, type Point, type Wall } from './index.ts';

const G = 100;
const wall: Wall = { id: 'w', a: [300, -500], b: [300, 500] };

describe('visibilityPolygon', () => {
  it('stops at walls and at the radius', () => {
    const poly = visibilityPolygon([0, 0], 1000, [wall]);
    expect(pointInPolygon([200, 0], poly)).toBe(true);
    expect(pointInPolygon([400, 0], poly)).toBe(false);
    expect(pointInPolygon([-900, 0], poly)).toBe(true);
    expect(pointInPolygon([-1100, 0], poly)).toBe(false);
  });

  it('sees through windows and open doors', () => {
    expect(pointInPolygon([400, 0], visibilityPolygon([0, 0], 1000, [{ ...wall, sight: false }]))).toBe(true);
    expect(pointInPolygon([400, 0], visibilityPolygon([0, 0], 1000, [{ ...wall, door: 'open' }]))).toBe(true);
  });
});

describe('tokensVisibleTo', () => {
  const player = { id: 'p1', name: 'P1', role: 'player' as const, color: '#fff' };
  const hero = TokenSchema.parse({ id: 'hero', name: 'Hero', x: 50, y: 50, controllers: ['p1'] });
  const ally = TokenSchema.parse({ id: 'ally', name: 'Ally', x: 5050, y: 50, controllers: ['p2'] });
  const orc = (x: number, y: number) => TokenSchema.parse({ id: 'orc', name: 'Orc', x, y });
  const ctx = (darkness: number, walls: Wall[] = [], lights: { x: number; y: number; bright: number; dim: number }[] = []) => ({
    world: { darkness, vision: true, gridSize: G },
    lights,
    wallsBetween: (_a: Point, _b: Point) => walls,
  });

  it('shows what is in sight by day and hides what is behind a wall', () => {
    expect(tokensVisibleTo(player, [hero, orc(250, 50)], ctx(0)).has('orc')).toBe(true);
    expect(tokensVisibleTo(player, [hero, orc(450, 50)], ctx(0, [wall])).has('orc')).toBe(false);
  });

  it('always shows the party', () => {
    expect(tokensVisibleTo(player, [hero, ally], ctx(1, [wall])).has('ally')).toBe(true);
  });

  it('needs light or darkvision at night', () => {
    expect(tokensVisibleTo(player, [hero, orc(1050, 50)], ctx(1)).has('orc')).toBe(false);
    const torch = { x: 1050, y: 150, bright: 10, dim: 10 };
    expect(tokensVisibleTo(player, [hero, orc(1050, 50)], ctx(1, [], [torch])).has('orc')).toBe(true);
    const elf = { ...hero, darkvision: 60 };
    expect(tokensVisibleTo(player, [elf, orc(1050, 50)], ctx(1)).has('orc')).toBe(true);
    expect(tokensVisibleTo(player, [elf, orc(1450, 50)], ctx(1)).has('orc')).toBe(false);
  });
});

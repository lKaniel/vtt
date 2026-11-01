import { describe, expect, it } from 'vitest';
import {
  NO_SENSES,
  type PlacedToken,
  type Point,
  pointInPolygon,
  tokensVisibleTo,
  visibilityPolygon,
  type Wall,
} from './index.ts';

type Tok = PlacedToken & { name: string; darkvision?: number };
const sight = (t: Tok) => ({
  senses: { ...NO_SENSES, darkvision: t.darkvision ?? 0 },
  blinded: false,
  invisible: false,
});

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
    expect(pointInPolygon([400, 0], visibilityPolygon([0, 0], 1000, [{ ...wall, sight: 'none' }]))).toBe(true);
    expect(pointInPolygon([400, 0], visibilityPolygon([0, 0], 1000, [{ ...wall, door: 'open' }]))).toBe(true);
  });
});

describe('tokensVisibleTo', () => {
  const tok = (t: Tok): Tok => t;
  const player = { id: 'p1', name: 'P1', role: 'player' as const, color: '#fff' };
  const hero = tok({
    id: 'hero',
    name: 'Hero',
    x: 50,
    y: 50,
    ownership: { default: 'limited', p1: 'owner' },
  });
  const ally = tok({
    id: 'ally',
    name: 'Ally',
    x: 5050,
    y: 50,
    ownership: { default: 'limited', p2: 'owner' },
  });
  const orc = (x: number, y: number) => tok({ id: 'orc', name: 'Orc', x, y });
  const ctx = (
    darkness: number,
    walls: Wall[] = [],
    lights: { x: number; y: number; bright: number; dim: number }[] = [],
  ) => ({
    world: { darkness, vision: true, gridSize: G },
    lights,
    wallsBetween: (_a: Point, _b: Point) => walls,
    perceiver: sight,
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

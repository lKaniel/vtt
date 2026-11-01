import { describe, expect, it } from 'vitest';
import {
  ambientLevel,
  lightLevelAt,
  perceives,
  sensesOf,
  TokenSchema,
  tokensVisibleTo,
  type Effect,
  type LightSource,
  type Point,
  type Wall,
} from './index.ts';

const G = 100;
const wall: Wall = { id: 'w', a: [300, -500], b: [300, 500] };
const open = () => true;
const blockedBy =
  (w: Wall) =>
  (a: Point, b: Point): boolean =>
    !(Math.min(a[0], b[0]) < w.a[0] && Math.max(a[0], b[0]) > w.a[0]);

const token = (extra: object = {}) => TokenSchema.parse({ id: 't', name: 'T', x: 0, y: 0, ...extra });
const effect = (extra: Partial<Effect>): Effect => ({ id: 'e', name: 'E', ...extra });

describe('sensesOf', () => {
  it('takes the best of the token, its monster and its effects', () => {
    const senses = sensesOf(
      token({ darkvision: 30, effects: [effect({ senses: { darkvision: 60, seeInvisible: true } })] }),
      { darkvision: 0, blindsight: 10, tremorsense: 0, truesight: 0 },
    );
    expect(senses).toEqual({
      darkvision: 60,
      blindsight: 10,
      tremorsense: 0,
      truesight: 0,
      devilsSight: 0,
      seeInvisible: true,
    });
  });

  it('reads blindsight, truesight and devil’s sight written on the token', () => {
    const s = sensesOf(token({ blindsight: 30, truesight: 120, devilsSight: 120 }));
    expect([s.blindsight, s.truesight, s.devilsSight]).toEqual([30, 120, 120]);
  });
});

describe('light levels', () => {
  const ctx = (darkness: number, lights: LightSource[] = [], clear: (a: Point, b: Point) => boolean = open) => ({
    darkness,
    gridSize: G,
    lights,
    clear,
  });
  const torch: LightSource = { x: 0, y: 0, bright: 20, dim: 20 };

  it('turns world darkness into bright light, dim light or darkness', () => {
    expect([ambientLevel(0), ambientLevel(0.45), ambientLevel(0.85)]).toEqual(['bright', 'dim', 'dark']);
  });

  it('is bright near a light, dim further out and dark beyond it', () => {
    expect(lightLevelAt([300, 0], ctx(1, [torch])).level).toBe('bright');
    expect(lightLevelAt([700, 0], ctx(1, [torch])).level).toBe('dim');
    expect(lightLevelAt([900, 0], ctx(1, [torch])).level).toBe('dark');
  });

  it('does not light through walls', () => {
    expect(lightLevelAt([400, 0], ctx(1, [torch], blockedBy(wall))).level).toBe('dark');
  });

  it('lets magical darkness swallow every other light', () => {
    const darkness: LightSource = { x: 300, y: 0, bright: 15, dim: 0, darkness: true };
    const here = lightLevelAt([300, 0], ctx(0, [torch, darkness]));
    expect(here).toEqual({ level: 'dark', magical: true });
  });
});

describe('perceives', () => {
  const night = { darkness: 1, gridSize: G, lights: [] as LightSource[], clear: open };
  const eyes = (extra: object = {}) => ({ at: [0, 0] as Point, senses: sensesOf(token(extra)), blinded: false });
  const target = (x: number, invisible = false) => ({ at: [x, 0] as Point, invisible });

  it('needs darkvision in the dark, within its range', () => {
    expect(perceives(eyes(), target(500), night)).toBe(false);
    expect(perceives(eyes({ darkvision: 60 }), target(1100), night)).toBe(true);
    expect(perceives(eyes({ darkvision: 60 }), target(1300), night)).toBe(false);
  });

  it('sees anything lit, even dimly', () => {
    const lit = { ...night, lights: [{ x: 1500, y: 0, bright: 0, dim: 10 }] };
    expect(perceives(eyes(), target(1500), lit)).toBe(true);
  });

  it('cannot see through magical darkness without devil’s sight or truesight', () => {
    const dark = { ...night, darkness: 0, lights: [{ x: 500, y: 0, bright: 15, dim: 0, darkness: true }] };
    expect(perceives(eyes({ darkvision: 120 }), target(500), dark)).toBe(false);
    expect(perceives(eyes({ devilsSight: 120 }), target(500), dark)).toBe(true);
    expect(perceives(eyes({ truesight: 60 }), target(500), dark)).toBe(true);
  });

  it('finds invisible creatures only with blindsight, truesight, tremorsense or see invisibility', () => {
    const day = { ...night, darkness: 0 };
    expect(perceives(eyes(), target(500, true), day)).toBe(false);
    expect(perceives(eyes({ blindsight: 30 }), target(500, true), day)).toBe(true);
    expect(perceives(eyes({ truesight: 30 }), target(500, true), day)).toBe(true);
    expect(perceives(eyes({ tremorsense: 30 }), target(500, true), day)).toBe(true);
    const seeInvisibility = { effects: [effect({ senses: { seeInvisible: true } })] };
    expect(perceives(eyes(seeInvisibility), target(500, true), day)).toBe(true);
  });

  it('feels through walls with tremorsense but needs a clear line for everything else', () => {
    const day = { ...night, darkness: 0, clear: blockedBy(wall) };
    expect(perceives(eyes({ blindsight: 60 }), target(500), day)).toBe(false);
    expect(perceives(eyes({ tremorsense: 60 }), target(500), day)).toBe(true);
  });

  it('leaves a blinded creature only its blindsight and tremorsense', () => {
    const day = { ...night, darkness: 0 };
    expect(perceives({ ...eyes(), blinded: true }, target(300), day)).toBe(false);
    expect(perceives({ ...eyes({ blindsight: 10 }), blinded: true }, target(300), day)).toBe(false);
    expect(perceives({ ...eyes({ blindsight: 30 }), blinded: true }, target(300), day)).toBe(true);
  });
});

describe('tokensVisibleTo with senses', () => {
  const player = { id: 'p1', name: 'P1', role: 'player' as const, color: '#fff' };
  const ctx = (darkness: number) => ({
    world: { darkness, vision: true, gridSize: G },
    lights: [],
    wallsBetween: () => [],
  });

  it('hides invisible creatures from plain sight', () => {
    const hero = TokenSchema.parse({
      id: 'hero',
      name: 'Hero',
      x: 50,
      y: 50,
      ownership: { default: 'limited', p1: 'owner' },
    });
    const sprite = TokenSchema.parse({
      id: 'sprite',
      name: 'Sprite',
      x: 250,
      y: 50,
      effects: [effect({ conditions: ['invisible'] })],
    });
    expect(tokensVisibleTo(player, [hero, sprite], ctx(0)).has('sprite')).toBe(false);
    const bat = { ...hero, blindsight: 60 };
    expect(tokensVisibleTo(player, [bat, sprite], ctx(0)).has('sprite')).toBe(true);
  });

  it('uses the monster’s senses through a lookup', () => {
    const hero = TokenSchema.parse({
      id: 'hero',
      name: 'Hero',
      x: 50,
      y: 50,
      ownership: { default: 'limited', p1: 'owner' },
      monster: 'bat',
    });
    const orc = TokenSchema.parse({ id: 'orc', name: 'Orc', x: 1450, y: 50 });
    const senses = { darkvision: 0, blindsight: 60, tremorsense: 0, truesight: 0 };
    expect(tokensVisibleTo(player, [hero, orc], { ...ctx(1), monster: () => senses }).has('orc')).toBe(false);
    const near = { ...orc, x: 450 };
    expect(tokensVisibleTo(player, [hero, near], { ...ctx(1), monster: () => senses }).has('orc')).toBe(true);
  });
});

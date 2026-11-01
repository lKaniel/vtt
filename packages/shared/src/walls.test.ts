import { describe, expect, it } from 'vitest';
import {
  hasLineOfSight,
  movementBlocked,
  pointInPolygon,
  restriction,
  soundVolume,
  visibilityPolygon,
  type Wall,
  WallSchema,
  wallPreset,
  wallsCrossed,
} from './index.ts';

const G = 100;
const wall = (x: number, extra: Partial<Wall> = {}): Wall => ({ id: `w${x}`, a: [x, -500], b: [x, 500], ...extra });
const light = { kind: 'light', gridSize: G } as const;

describe('wall restrictions', () => {
  it('blocks everything by default and nothing once a door is open', () => {
    for (const kind of ['move', 'sight', 'light', 'sound'] as const) {
      expect(restriction(wall(0), kind)).toBe('normal');
      expect(restriction(wall(0, { door: 'open' }), kind)).toBe('none');
    }
  });

  it('reads the old window flag as a wall that lets sight and light through', () => {
    const old = WallSchema.parse({ id: 'win', a: [0, 0], b: [100, 0], sight: false });
    expect(old).toMatchObject({ sight: 'none', light: 'none' });
    expect(restriction(old, 'move')).toBe('normal');
    expect(restriction(old, 'sound')).toBe('normal');
    expect(WallSchema.parse({ id: 'w', a: [0, 0], b: [1, 0], sight: true })).not.toHaveProperty('sight');
  });

  it('names the usual kinds of wall', () => {
    expect(wallPreset(wall(0))).toBe('wall');
    expect(wallPreset(wall(0, { door: 'locked' }))).toBe('door');
    expect(wallPreset(wall(0, { sight: 'none', light: 'none' }))).toBe('window');
    expect(wallPreset(wall(0, { move: 'none' }))).toBe('ethereal');
    expect(wallPreset(wall(0, { sight: 'none', light: 'none', sound: 'none' }))).toBe('invisible');
    expect(wallPreset(wall(0, { sight: 'limited', light: 'limited', sound: 'limited' }))).toBe('terrain');
    expect(wallPreset(wall(0, { sight: 'proximity' }))).toBe('custom');
  });

  it('has no limited or proximity movement', () => {
    expect(WallSchema.safeParse({ id: 'w', a: [0, 0], b: [1, 0], move: 'limited' }).success).toBe(false);
  });

  it('lets creatures walk through a wall that does not restrict movement', () => {
    expect(movementBlocked([0, 0], [400, 0], [wall(300)])).toBe(true);
    expect(movementBlocked([0, 0], [400, 0], [wall(300, { move: 'none' })])).toBe(false);
  });

  it('keeps sight and light apart', () => {
    const curtain = wall(300, { light: 'none' });
    expect(hasLineOfSight([0, 0], [400, 0], [curtain])).toBe(false);
    expect(hasLineOfSight([0, 0], [400, 0], [curtain], light)).toBe(true);
    const glass = wall(300, { sight: 'none' });
    expect(hasLineOfSight([0, 0], [400, 0], [glass])).toBe(true);
    expect(hasLineOfSight([0, 0], [400, 0], [glass], light)).toBe(false);
  });

  it('sees through one limited wall but not two', () => {
    const terrain = { sight: 'limited' } as const;
    expect(hasLineOfSight([0, 0], [400, 0], [wall(300, terrain)])).toBe(true);
    expect(hasLineOfSight([0, 0], [600, 0], [wall(300, terrain), wall(500, terrain)])).toBe(false);
    const poly = visibilityPolygon([0, 0], 1000, [wall(300, terrain), wall(500, terrain)]);
    expect(pointInPolygon([400, 0], poly)).toBe(true);
    expect(pointInPolygon([600, 0], poly)).toBe(false);
  });

  it('lets a proximity wall through only from close by', () => {
    const fence = wall(300, { sight: 'proximity', threshold: { sight: 10 } });
    expect(hasLineOfSight([150, 0], [400, 0], [fence], { kind: 'sight', gridSize: G })).toBe(true);
    expect(hasLineOfSight([0, 0], [400, 0], [fence], { kind: 'sight', gridSize: G })).toBe(false);
    expect(pointInPolygon([400, 0], visibilityPolygon([150, 0], 1000, [fence], { kind: 'sight', gridSize: G }))).toBe(
      true,
    );
    expect(pointInPolygon([400, 0], visibilityPolygon([0, 0], 1000, [fence], { kind: 'sight', gridSize: G }))).toBe(
      false,
    );
  });

  it('counts the walls that stand in the way', () => {
    const walls = [wall(100), wall(200, { sound: 'none' }), wall(300, { sound: 'limited' }), wall(400)];
    expect(wallsCrossed([0, 0], [500, 0], walls, { kind: 'sound', gridSize: G })).toBe(2);
    expect(wallsCrossed([0, 0], [500, 0], walls, { kind: 'sight', gridSize: G })).toBe(4);
  });

  it('muffles sound only through walls that stop it', () => {
    const sound = { id: 's', x: 0, y: 0, radius: 50, src: 'x.ogg', volume: 1 };
    const hearing = (walls: Wall[]) => ({ gridSize: G, wallsBetween: () => walls });
    const open = soundVolume(sound, [400, 0], hearing([]));
    expect(soundVolume(sound, [400, 0], hearing([wall(300, { sound: 'none' })]))).toBeCloseTo(open);
    expect(soundVolume(sound, [400, 0], hearing([wall(300)]))).toBeLessThan(open);
  });
});

import { describe, expect, it } from 'vitest';
import {
  doorSoundOf,
  doorSwings,
  hasLineOfSight,
  movementBlocked,
  pointInPolygon,
  restriction,
  sideOf,
  soundVolume,
  visibilityPolygon,
  type Wall,
  WallSchema,
  wallFor,
  wallPreset,
  wallsAt,
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

describe('one-way walls', () => {
  // A wall from (300, -500) down to (300, 500): looking from a to b, left is +x (east), right is -x (west).
  const oneWay = (dir: 'left' | 'right') => wall(300, { dir });

  it('stop only what comes from their side', () => {
    expect(hasLineOfSight([0, 0], [400, 0], [oneWay('right')])).toBe(false);
    expect(hasLineOfSight([400, 0], [0, 0], [oneWay('right')])).toBe(true);
    expect(hasLineOfSight([400, 0], [0, 0], [oneWay('left')])).toBe(false);
    expect(movementBlocked([0, 0], [400, 0], [oneWay('left')])).toBe(false);
    expect(movementBlocked([400, 0], [0, 0], [oneWay('left')])).toBe(true);
  });

  it('show what is past them only from the open side', () => {
    expect(pointInPolygon([400, 0], visibilityPolygon([0, 0], 1000, [oneWay('left')]))).toBe(true);
    expect(pointInPolygon([400, 0], visibilityPolygon([0, 0], 1000, [oneWay('right')]))).toBe(false);
  });

  it('names the side a point is on', () => {
    expect(sideOf(oneWay('left'), [400, 0])).toBe('left');
    expect(sideOf(oneWay('left'), [0, 0])).toBe('right');
  });
});

describe('secret doors', () => {
  const secret = wall(300, { door: 'closed', secret: true });

  it('look like plain walls to players until they are opened', () => {
    expect(wallFor(secret, false)).toEqual({ id: 'w300', a: [300, -500], b: [300, 500] });
    expect(wallFor(secret, true)).toBe(secret);
    expect(wallFor({ ...secret, door: 'open' }, false)).toEqual({
      id: 'w300',
      a: [300, -500],
      b: [300, 500],
      door: 'open',
    });
    expect(wallFor(wall(0, { door: 'closed' }), false)).toEqual(wall(0, { door: 'closed' }));
  });
});

describe('door sounds', () => {
  const chunk = (...walls: Wall[]) => ({ tiles: [], walls, lights: [] });
  const door = (state: 'open' | 'closed' | 'locked', extra: Partial<Wall> = {}) => wall(0, { door: state, ...extra });

  it('tells which doors swung open, shut, or were locked and unlocked', () => {
    expect(doorSwings(chunk(door('closed')), chunk(door('open')))).toEqual([{ wall: door('open'), swing: 'open' }]);
    expect(doorSwings(chunk(door('open')), chunk(door('closed')))[0]!.swing).toBe('close');
    expect(doorSwings(chunk(door('closed')), chunk(door('locked')))[0]!.swing).toBe('lock');
    expect(doorSwings(chunk(door('locked')), chunk(door('closed')))[0]!.swing).toBe('unlock');
    expect(doorSwings(chunk(door('closed')), chunk(door('closed')))).toEqual([]);
    expect(doorSwings(undefined, chunk(door('open')))).toEqual([]);
  });

  it('sound wooden unless the door says otherwise', () => {
    expect(doorSoundOf(door('open'))).toBe('wood');
    expect(doorSoundOf(door('open', { doorSound: 'iron' }))).toBe('iron');
    expect(doorSoundOf(door('open', { doorSound: 'none' }))).toBeUndefined();
  });
});

describe('wall height', () => {
  const low = wall(300, { height: { top: 5 } });
  const high = wall(300, { height: { bottom: 20 } });

  it('stands only between its bottom and top', () => {
    expect(wallsAt([low, high, wall(0)], 0).map((w) => w.id)).toEqual(['w300', 'w0']);
    expect(wallsAt([low, high, wall(0)], 10).map((w) => w.id)).toEqual(['w0']);
    expect(wallsAt([low, high, wall(0)], 30).map((w) => w.id)).toEqual(['w300', 'w0']);
    expect(wallsAt([low], undefined)).toEqual([low]);
  });

  it('lets a flier see and fly over a low wall', () => {
    const v = {
      'sight-0': hasLineOfSight([0, 0], [400, 0], wallsAt([low], 0)),
      'sight-30': hasLineOfSight([0, 0], [400, 0], wallsAt([low], 30)),
    };
    expect(v).toEqual({ 'sight-0': false, 'sight-30': true });
    expect(movementBlocked([0, 0], [400, 0], wallsAt([low], 30))).toBe(false);
  });
});

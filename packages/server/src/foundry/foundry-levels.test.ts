import { describe, expect, it } from 'vitest';
import { foundryFloors } from './foundry-levels.ts';

// Floors from both kinds of Foundry data in Kaniel's world: v14's own scene
// levels (overlapping bands the Levels migration made) and the old Levels
// module's flags (floor bands, tile ranges, stair and elevator drawings).

const feet = (units: number) => units;

const v14Level = (id: string, name: string, [bottom, top]: [number, number], sees: string[] = []) => ({
  _id: id,
  name,
  elevation: { bottom, top },
  background: { src: null },
  visibility: { levels: sees },
});

const church = {
  levels: [
    v14Level('up', 'Church - Level (10|20)', [10, 20], ['defaultLevel0000', 'down', 'span']),
    v14Level('down', 'Church - Level (0|10)', [0, 10], ['defaultLevel0000', 'span']),
    v14Level('bell', 'Church - Level (60|60)', [60, 60], ['up', 'down', 'span']),
    v14Level('span', 'Church - Level (0|59)', [0, 59], ['down']),
  ],
};

describe('v14 scene levels', () => {
  const floors = foundryFloors(church, feet)!;

  it('become our floors, one per bottom, the tightest band naming it', () => {
    expect(floors.levels).toEqual([
      { id: 'level-1', name: 'Church - Level (0|10)', bottom: 0, top: 10 },
      { id: 'level-2', name: 'Church - Level (10|20)', bottom: 10, top: 20, sees: ['level-1'] },
      { id: 'level-3', name: 'Church - Level (60|60)', bottom: 60, sees: ['level-1', 'level-2'] },
    ]);
  });

  it('put each item on the floors its levels cover', () => {
    expect(floors.on({ levels: ['up'] })).toEqual({ level: 'level-2' });
    expect(floors.on({ levels: ['span'] })).toEqual({ levels: ['level-1', 'level-2'] });
    expect(floors.on({ levels: ['down', 'span', 'up', 'bell'] })).toEqual({});
    expect(floors.on({ levels: [] })).toEqual({});
  });

  it('turn a change-level region into stairs between two floors, or an elevator among more', () => {
    expect(floors.behaviors({ levels: ['down', 'up'], behaviors: [{ type: 'changeLevel', system: {} }] })).toEqual([
      { type: 'stairs', between: ['level-1', 'level-2'] },
    ]);
    expect(
      floors.behaviors({ levels: ['down', 'up', 'bell'], behaviors: [{ type: 'changeLevel', system: {} }] }),
    ).toEqual([{ type: 'elevator', floors: ['level-1', 'level-2', 'level-3'] }]);
  });

  it('read the floor a token was on', () => {
    expect(floors.elevationOf({ level: 'up', elevation: 0 })).toBe(10);
    expect(floors.elevationOf({ level: 'up', elevation: 15 })).toBe(15);
    expect(floors.elevationOf({ elevation: 5 })).toBe(5);
  });

  it('are left out when the scene has only its default level', () => {
    expect(foundryFloors({ levels: [v14Level('defaultLevel0000', 'Cave', [0, 20])] }, feet)).toBeUndefined();
  });
});

const keep = {
  levels: [v14Level('defaultLevel0000', 'Keep', [0, 20])],
  flags: {
    levels: {
      sceneLevels: [
        ['0', '9', 'Ground'],
        ['10', '19', 'Greathall'],
        ['10', '29', 'walls'],
        ['20', '29', ''],
      ],
    },
  },
};

describe('Levels module flags', () => {
  const floors = foundryFloors(keep, feet)!;

  it('become our floors', () => {
    expect(floors.levels).toEqual([
      { id: 'level-1', name: 'Ground', bottom: 0, top: 9 },
      { id: 'level-2', name: 'Greathall', bottom: 10, top: 19, sees: ['level-1'] },
      { id: 'level-3', name: 'Level at 20 ft', bottom: 20, top: 29, sees: ['level-1', 'level-2'] },
    ]);
  });

  it('put tiles, lights and walls on the floors their range covers', () => {
    expect(floors.on({ elevation: 10, flags: { levels: { rangeTop: 19 } } })).toEqual({ level: 'level-2' });
    expect(floors.on({ elevation: 10, flags: { levels: { rangeTop: null } } })).toEqual({
      levels: ['level-2', 'level-3'],
    });
    expect(floors.on({ elevation: 0, flags: { levels: { rangeTop: null } } })).toEqual({});
    expect(floors.on({ flags: { levels: { rangeBottom: 0, rangeTop: 9 } } })).toEqual({ level: 'level-1' });
    expect(floors.on({ flags: { 'wall-height': { bottom: 20, top: 29 } } })).toEqual({ level: 'level-3' });
    expect(floors.on({ flags: { 'wall-height': { bottom: null, top: null } } })).toEqual({});
  });

  it('turn stair, one-way stair and elevator drawings into regions', () => {
    const rect = { type: 'r', width: 100, height: 50 };
    expect(
      floors.drawingRegion({
        x: 10,
        y: 20,
        elevation: 0,
        shape: rect,
        flags: { levels: { drawingMode: 2, rangeTop: 9 } },
      }),
    ).toEqual({
      name: 'Stairs',
      points: [
        [10, 20],
        [110, 20],
        [110, 70],
        [10, 70],
      ],
      levels: ['level-1', 'level-2'],
      behaviors: [{ type: 'stairs', between: ['level-1', 'level-2'] }],
    });
    expect(
      floors.drawingRegion({
        x: 0,
        y: 0,
        elevation: 0,
        shape: rect,
        flags: { levels: { drawingMode: 22, rangeTop: 9 } },
      }),
    ).toMatchObject({ level: 'level-2', behaviors: [{ type: 'level', to: 'level-1' }] });
    const lift = floors.drawingRegion({
      x: 0,
      y: 0,
      elevation: 0,
      shape: rect,
      flags: { levels: { drawingMode: 3, rangeTop: 29, elevatorFloors: '0,Ground|20,Top' } },
    });
    expect(lift?.behaviors).toEqual([{ type: 'elevator', floors: ['level-1', 'level-3'] }]);
    expect(floors.drawingRegion({ x: 0, y: 0, shape: rect, flags: { levels: { drawingMode: 0 } } })).toBeUndefined();
    const hole = (rangeTop: number) =>
      floors.drawingRegion({
        x: 0,
        y: 0,
        elevation: rangeTop - 9,
        shape: rect,
        flags: { levels: { drawingMode: 1, rangeTop } },
      });
    expect(hole(19)).toMatchObject({ name: 'Hole', level: 'level-2', behaviors: [{ type: 'fall' }] });
    // Nothing to fall to under the lowest floor.
    expect(hole(9)).toBeUndefined();
  });

  it('read Levels stair scripts on regions', () => {
    const script = (source: string) => ({
      elevation: { bottom: 0, top: 10 },
      behaviors: [{ type: 'executeScript', system: { source } }],
    });
    expect(floors.behaviors(script('CONFIG.Levels.handlers.RegionHandler.stair(region,event);'))).toEqual([
      { type: 'stairs', between: ['level-1', 'level-2'] },
    ]);
    expect(
      floors.behaviors(script('CONFIG.Levels.handlers.RegionHandler.elevator(region,event,"0,Ground|10,Hall")')),
    ).toEqual([{ type: 'elevator', floors: ['level-1', 'level-2'] }]);
  });
});

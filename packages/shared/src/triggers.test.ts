import { describe, expect, it } from 'vitest';
import { chunkFor } from './doors.ts';
import { RegionBehaviorSchema } from './scene-items.ts';
import type { Chunk, DrawnTile } from './schema.ts';
import { TileTriggerSchema } from './trigger-schema.ts';
import { doorAfter, nextImage, tileClickable, tileWorks, tilesEntered } from './triggers.ts';

const plate = (over: Partial<DrawnTile> = {}): DrawnTile =>
  ({
    kind: 'image',
    id: 'plate',
    x: 100,
    y: 100,
    w: 100,
    h: 100,
    src: '/assets/plate.png',
    trigger: TileTriggerSchema.parse({ on: 'enter', actions: [{ type: 'message', text: 'Click!' }] }),
    ...over,
  }) as DrawnTile;

describe('trigger schema', () => {
  it('clicks by default, and regions take trigger actions as behaviours', () => {
    expect(TileTriggerSchema.parse({}).on).toBe('click');
    expect(RegionBehaviorSchema.parse({ type: 'door', wall: 'gate', to: 'toggle' })).toEqual({
      type: 'door',
      wall: 'gate',
      to: 'toggle',
    });
    expect(RegionBehaviorSchema.safeParse({ type: 'sound' }).success).toBe(false);
  });
});

describe('nextImage', () => {
  it('goes round the pictures, and starts at the first when the tile shows another', () => {
    const images = ['/a.png', '/b.png', '/c.png'];
    expect(nextImage('/a.png', images)).toBe('/b.png');
    expect(nextImage('/c.png', images)).toBe('/a.png');
    expect(nextImage('/other.png', images)).toBe('/a.png');
  });
});

describe('doorAfter', () => {
  it('sets a door, and toggling opens a shut door and shuts an open one', () => {
    expect(doorAfter('closed', 'locked')).toBe('locked');
    expect(doorAfter('open', 'toggle')).toBe('closed');
    expect(doorAfter('locked', 'toggle')).toBe('open');
  });
});

describe('tilesEntered', () => {
  it('finds the enter-trigger tiles a walk stepped onto, nearest first', () => {
    const far = plate({ id: 'far', x: 300 });
    const clickOnly = plate({ id: 'button', trigger: TileTriggerSchema.parse({}) });
    const path: [number, number][] = [
      [50, 150],
      [150, 150],
      [250, 150],
      [350, 150],
    ];
    expect(tilesEntered([far, plate(), clickOnly], path).map((h) => h.tile.id)).toEqual(['plate', 'far']);
  });

  it('skips a tile the walk started on and one that is off', () => {
    const off = plate({ id: 'off', trigger: { on: 'enter', actions: [], disabled: true } });
    const path: [number, number][] = [
      [150, 150],
      [150, 250],
    ];
    expect(tilesEntered([plate(), off], path)).toEqual([]);
    expect(tileWorks(off)).toBe(false);
  });
});

describe('chunkFor and triggers', () => {
  it('keeps hidden tiles from players and gives them only that a tile can be clicked', () => {
    const button = plate({
      id: 'button',
      trigger: TileTriggerSchema.parse({ actions: [{ type: 'message', text: 'secret' }] }),
    });
    const chunk: Chunk = { tiles: [button, plate(), plate({ id: 'ghost', hidden: true })], walls: [], lights: [] };
    const seen = chunkFor(chunk, false);
    expect(seen.tiles.map((t) => t.id)).toEqual(['button', 'plate']);
    expect(seen.tiles[0]!.trigger).toEqual({ on: 'click', actions: [] });
    // A pressure plate gives nothing away.
    expect(seen.tiles[1]!.trigger).toBeUndefined();
    expect(chunkFor(chunk, true)).toBe(chunk);
  });
});

describe('tileClickable', () => {
  it('is a working click trigger, GM-only ones for the GM alone', () => {
    const button = plate({ trigger: TileTriggerSchema.parse({ gmOnly: true }) });
    expect(tileClickable(button, true)).toBe(true);
    expect(tileClickable(button, false)).toBe(false);
    expect(tileClickable(plate({ trigger: TileTriggerSchema.parse({}) }), false)).toBe(true);
    expect(tileClickable(plate(), true)).toBe(false);
    expect(tileClickable(plate({ trigger: undefined }), true)).toBe(false);
  });
});

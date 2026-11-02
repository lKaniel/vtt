import { DrawingSchema, NoteSchema, RegionSchema, SoundSchema, TemplateSchema } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { foundryPlaceables } from './foundry-placeables.ts';

// Drawings, notes, templates, ambient sounds and (v12) regions of a Foundry
// scene. The scene has 200 px squares of 5 ft, so 10 grid units are 10 ft.

const media = (path: string) => (path === 'sounds/brook.ogg' ? 'pack://caves/media/sounds/brook.ogg' : undefined);
const grid = { size: 200, distance: 5 };
const scene = {
  drawings: [
    { x: 100, y: 100, shape: { type: 'r', width: 400, height: 200 }, strokeColor: '#ff0000', strokeWidth: 4 },
    {
      x: 100,
      y: 100,
      shape: { type: 'e', width: 200, height: 200 },
      fillType: 1,
      fillColor: '#00ff00',
      fillAlpha: 0.5,
    },
    { x: 500, y: 500, shape: { type: 'p', points: [0, 0, 100, 0, 100, 100] } },
    { x: 0, y: 0, shape: { type: 'f', points: [0, 0, 10, 10, 20, 0] } },
    {
      x: 50,
      y: 60,
      shape: { type: 'r', width: 300, height: 80 },
      text: 'Here be dragons',
      fontSize: 32,
      textColor: '#ffffff',
    },
    { x: 0, y: 0, shape: { type: 'p', points: [0, 0] } },
  ],
  notes: [
    { x: 300, y: 400, entryId: 'Jx1', pageId: 'Pg1', text: 'The old well' },
    { x: 1, y: 2 },
  ],
  templates: [
    { t: 'circle', x: 1000, y: 1000, distance: 20, fillColor: '#ff8800' },
    { t: 'cone', x: 0, y: 0, distance: 15, direction: 90, angle: 90 },
    { t: 'ray', x: 0, y: 0, distance: 30, direction: 0, width: 5 },
    { t: 'rect', x: 0, y: 0, distance: Math.hypot(10, 10), direction: 45 },
  ],
  sounds: [
    { x: 800, y: 800, radius: 30, path: 'sounds/brook.ogg', volume: 0.6, walls: true, darkness: { min: 0.5, max: 1 } },
    { x: 1, y: 1, radius: 10, path: 'sounds/missing.ogg' },
  ],
  regions: [
    {
      name: 'Bog',
      color: '#335533',
      visibility: 2,
      shapes: [{ type: 'rectangle', x: 0, y: 0, width: 400, height: 200 }],
      behaviors: [
        { type: 'displayScrollingText', system: { text: 'Squelch' } },
        { type: 'executeMacro', system: {} },
      ],
    },
  ],
};

describe('Foundry placeables', () => {
  const entries = (id: string) => (id === 'Jx1' ? 'the-well' : undefined);
  const pages = (id: string) => (id === 'Pg1' ? 'page-1' : undefined);
  const out = foundryPlaceables(scene, { grid, media, entries, pages });

  it('bring drawings along: boxes, ellipses, polygons, freehand and text, with their look', () => {
    expect(out.drawings).toEqual([
      { id: 'drawing-1', shape: 'rect', x: 100, y: 100, w: 400, h: 200, stroke: '#ff0000', strokeWidth: 4 },
      { id: 'drawing-2', shape: 'ellipse', x: 100, y: 100, w: 200, h: 200, fill: '#00ff00', fillAlpha: 0.5 },
      {
        id: 'drawing-3',
        shape: 'polygon',
        points: [
          [500, 500],
          [600, 500],
          [600, 600],
        ],
      },
      {
        id: 'drawing-4',
        shape: 'freehand',
        points: [
          [0, 0],
          [10, 10],
          [20, 0],
        ],
      },
      {
        id: 'drawing-5',
        shape: 'text',
        x: 50,
        y: 60,
        w: 300,
        h: 80,
        text: 'Here be dragons',
        fontSize: 32,
        textColor: '#ffffff',
      },
    ]);
    for (const d of out.drawings) DrawingSchema.parse(d);
  });

  it('bring notes, pointing at the journal entries brought with them', () => {
    expect(out.notes).toEqual([
      { id: 'note-1', x: 300, y: 400, label: 'The old well', entry: 'the-well', page: 'page-1' },
      { id: 'note-2', x: 1, y: 2 },
    ]);
    for (const n of out.notes) NoteSchema.parse(n);
  });

  it('bring templates, in feet, a rectangle as the square it covers', () => {
    expect(out.templates).toEqual([
      { id: 'template-1', shape: 'circle', x: 1000, y: 1000, distance: 20, color: '#ff8800' },
      { id: 'template-2', shape: 'cone', x: 0, y: 0, distance: 15, direction: 90, angle: 90 },
      { id: 'template-3', shape: 'line', x: 0, y: 0, distance: 30, direction: 0, width: 5 },
      { id: 'template-4', shape: 'square', x: 200, y: 200, distance: 10 },
    ]);
    for (const t of out.templates) TemplateSchema.parse(t);
  });

  it('bring ambient sounds whose file came along', () => {
    expect(out.sounds).toEqual([
      {
        id: 'sound-1',
        x: 800,
        y: 800,
        radius: 30,
        src: 'pack://caves/media/sounds/brook.ogg',
        volume: 0.6,
        walls: true,
        activeAt: [0.5, 1],
      },
    ]);
    for (const s of out.sounds) SoundSchema.parse(s);
    expect(out.skipped).toContain('1 sound whose file is not in the module (sounds/missing.ogg)');
  });

  it('bring regions with the behaviours we have', () => {
    expect(out.regions).toEqual([
      {
        id: 'region-1',
        name: 'Bog',
        color: '#335533',
        visible: true,
        points: [
          [0, 0],
          [400, 0],
          [400, 200],
          [0, 200],
        ],
        behaviors: [{ type: 'message', text: 'Squelch' }],
      },
    ]);
    for (const r of out.regions) RegionSchema.parse(r);
    expect(out.skipped).toContain('1 region behaviour we have no match for (executeMacro)');
  });
});

describe('Foundry v14 templates, kept as regions', () => {
  const flagged = (shape: object, template: object = {}) => ({
    name: 'Fireball',
    color: '#ff4400',
    shapes: [shape],
    behaviors: [],
    flags: { core: { MeasuredTemplate: template } },
  });

  it('turns template regions into our templates, not regions', () => {
    const out = foundryPlaceables(
      {
        regions: [
          flagged({ type: 'circle', x: 1000, y: 1000, radius: 800 }),
          flagged({ type: 'cone', x: 0, y: 0, radius: 600, angle: 60, rotation: 90 }),
          flagged({ type: 'rectangle', x: 0, y: 0, width: 400, height: 400 }, { t: 'rect', distance: 10 }),
          flagged({ type: 'line', x: 0, y: 0, length: 1200, width: 200, rotation: 0 }),
          { name: 'Trap', shapes: [{ type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }], behaviors: [] },
        ],
      },
      { grid, media },
    );
    expect(out.templates).toEqual([
      { id: 'template-1', shape: 'circle', x: 1000, y: 1000, distance: 20, color: '#ff4400' },
      { id: 'template-2', shape: 'cone', x: 0, y: 0, distance: 15, direction: 90, angle: 60, color: '#ff4400' },
      { id: 'template-3', shape: 'square', x: 200, y: 200, distance: 10, color: '#ff4400' },
      { id: 'template-4', shape: 'line', x: 0, y: 0, distance: 30, direction: 0, width: 5, color: '#ff4400' },
    ]);
    expect(out.regions.map((r) => r.name)).toEqual(['Trap']);
    for (const t of out.templates) expect(TemplateSchema.safeParse(t).success).toBe(true);
  });
});

describe('a v14 scene', () => {
  it('ignores the old templates list, which the migration to regions left behind', () => {
    const out = foundryPlaceables(
      {
        levels: [{ _id: 'defaultLevel0000' }],
        templates: [{ t: 'circle', x: 0, y: 0, distance: 20 }],
        regions: [
          {
            color: '#ff0000',
            shapes: [{ type: 'rectangle', x: 2200, y: 2900, width: 200, height: 400, anchorX: 0, anchorY: 0 }],
            behaviors: [],
            flags: { core: { MeasuredTemplate: true } },
          },
        ],
      },
      { grid, media },
    );
    expect(out.templates).toEqual([
      { id: 'template-1', shape: 'square', x: 2300, y: 3100, distance: 10, color: '#ff0000' },
    ]);
  });
});

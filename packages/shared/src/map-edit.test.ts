import { describe, expect, it } from 'vitest';
import { applyMapEdit, type Chunk, ChunkSchema, MapEditSchema } from './index.ts';

const SIZE = 2000;
const empty = (): Chunk => ChunkSchema.parse({});

describe('applyMapEdit', () => {
  it('adds a wall to the chunk its midpoint is in, with a fresh id', () => {
    const chunks = new Map([
      ['0_0', { ...empty(), walls: [{ id: 'wall-1', a: [0, 0], b: [100, 0] }] as Chunk['walls'] }],
    ]);
    const out = applyMapEdit(chunks, SIZE, { op: 'addWall', wall: { a: [100, 0], b: [100, 300] } });
    expect(out).toHaveLength(1);
    expect(out[0]!.key).toBe('0_0');
    expect(out[0]!.chunk.walls.map((w) => w.id)).toEqual(['wall-1', 'wall-2']);
  });

  it('picks an id no chunk of the scene uses yet', () => {
    const chunks = new Map([
      ['0_0', { ...empty(), walls: [{ id: 'wall-1', a: [0, 0], b: [100, 0] }] as Chunk['walls'] }],
      ['1_0', { ...empty(), lights: [{ id: 'light-1', x: 2050, y: 50, bright: 5, dim: 0 }] }],
    ]);
    const wall = applyMapEdit(chunks, SIZE, { op: 'addWall', wall: { a: [2100, 0], b: [2200, 0] } });
    expect(wall[0]!.chunk.walls.map((w) => w.id)).toEqual(['wall-2']);
    const light = applyMapEdit(chunks, SIZE, { op: 'addLight', light: { x: 50, y: 50, bright: 5, dim: 0 } });
    expect(light[0]!.chunk.lights.map((l) => l.id)).toEqual(['light-2']);
  });

  it('creates the chunk when nothing was there yet, and names doors and windows', () => {
    const out = applyMapEdit(new Map(), SIZE, { op: 'addWall', wall: { a: [-200, 0], b: [-100, 0], door: 'closed' } });
    expect(out[0]!.key).toBe('-1_0');
    expect(out[0]!.chunk.walls[0]).toMatchObject({ id: 'door-1', door: 'closed' });
    const glass = applyMapEdit(new Map(), SIZE, {
      op: 'addWall',
      wall: { a: [0, 0], b: [100, 0], sight: 'none', light: 'none' },
    });
    expect(glass[0]!.chunk.walls[0]!.id).toBe('window-1');
  });

  it('refuses a wall with no length', () => {
    expect(() => applyMapEdit(new Map(), SIZE, { op: 'addWall', wall: { a: [5, 5], b: [5, 5] } })).toThrow();
  });

  it('removes walls and lights by id', () => {
    const chunks = new Map([
      [
        '0_0',
        {
          ...empty(),
          walls: [{ id: 'w', a: [0, 0], b: [100, 0] }] as Chunk['walls'],
          lights: [{ id: 'l', x: 50, y: 50, bright: 10, dim: 10 }],
        },
      ],
    ]);
    const a = applyMapEdit(chunks, SIZE, { op: 'remove', chunk: '0_0', id: 'w' });
    expect(a[0]!.chunk.walls).toEqual([]);
    const b = applyMapEdit(chunks, SIZE, { op: 'remove', chunk: '0_0', id: 'l' });
    expect(b[0]!.chunk.lights).toEqual([]);
    expect(() => applyMapEdit(chunks, SIZE, { op: 'remove', chunk: '0_0', id: 'nope' })).toThrow();
  });

  it('places a light and moves it into another chunk when it is dragged across', () => {
    const placed = applyMapEdit(new Map(), SIZE, {
      op: 'addLight',
      light: { x: 1950, y: 50, bright: 20, dim: 20, color: '#ff9a40', animation: 'flicker' },
    });
    const light = placed[0]!.chunk.lights[0]!;
    expect(light).toMatchObject({ id: 'light-1', color: '#ff9a40' });
    const chunks = new Map([[placed[0]!.key, placed[0]!.chunk]]);
    const moved = applyMapEdit(chunks, SIZE, { op: 'moveLight', chunk: '0_0', id: 'light-1', to: [2050, 50] });
    expect(moved.map((m) => m.key).sort((a, b) => a.localeCompare(b))).toEqual(['0_0', '1_0']);
    expect(moved.find((m) => m.key === '1_0')!.chunk.lights[0]).toMatchObject({ x: 2050, color: '#ff9a40' });
    expect(moved.find((m) => m.key === '0_0')!.chunk.lights).toEqual([]);
  });

  it('turns a wall into a door or back', () => {
    const chunks = new Map([['0_0', { ...empty(), walls: [{ id: 'w', a: [0, 0], b: [100, 0] }] as Chunk['walls'] }]]);
    const out = applyMapEdit(chunks, SIZE, { op: 'setWall', chunk: '0_0', id: 'w', door: 'closed' });
    expect(out[0]!.chunk.walls[0]!.door).toBe('closed');
    const back = applyMapEdit(new Map([['0_0', out[0]!.chunk]]), SIZE, { op: 'setWall', chunk: '0_0', id: 'w' });
    expect(back[0]!.chunk.walls[0]).not.toHaveProperty('door');
    const curtain = applyMapEdit(new Map([['0_0', out[0]!.chunk]]), SIZE, {
      op: 'setWall',
      chunk: '0_0',
      id: 'w',
      sight: 'limited',
      sound: 'none',
    });
    expect(curtain[0]!.chunk.walls[0]).toEqual({ id: 'w', a: [0, 0], b: [100, 0], sight: 'limited', sound: 'none' });
  });

  it('validates edits coming over the wire', () => {
    expect(MapEditSchema.safeParse({ op: 'addLight', light: { x: 0, y: 0, bright: -5 } }).success).toBe(false);
    expect(MapEditSchema.safeParse({ op: 'remove', chunk: '0_0', id: 'w' }).success).toBe(true);
  });
});

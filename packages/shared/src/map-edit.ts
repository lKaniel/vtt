import { z } from 'zod';
import { chunkOf } from './chunks.ts';
import { DoorStateSchema, LightSchema, PointSchema, type Chunk, type PlacedLight, type Wall } from './schema.ts';

// The GM's map tools: drawing walls, doors and windows, placing lights, and
// erasing them. Each edit names what changes; applyMapEdit works out which
// chunk files change and how, so the server only has to save them.

export const MapEditSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('addWall'),
    wall: z.object({ a: PointSchema, b: PointSchema, door: DoorStateSchema.optional(), sight: z.boolean().optional() }),
  }),
  /** Make a wall a door (or a window with `sight: false`), or a plain wall again. */
  z.object({
    op: z.literal('setWall'),
    chunk: z.string(),
    id: z.string(),
    door: DoorStateSchema.optional(),
    sight: z.boolean().optional(),
  }),
  z.object({ op: z.literal('addLight'), light: LightSchema.extend({ x: z.number(), y: z.number() }) }),
  z.object({ op: z.literal('moveLight'), chunk: z.string(), id: z.string(), to: PointSchema }),
  /** Erase a wall or a light. */
  z.object({ op: z.literal('remove'), chunk: z.string(), id: z.string() }),
]);
export type MapEdit = z.infer<typeof MapEditSchema>;

/** A chunk that changed, to be saved and sent out. */
export interface ChunkChange {
  key: string;
  chunk: Chunk;
}

/** Thrown for an edit that can't be made, with a message for the GM. */
export class MapEditError extends Error {}

type Chunks = ReadonlyMap<string, Chunk>;

const blank = (): Chunk => ({ tiles: [], walls: [], lights: [] });

/** `prefix-N` with the lowest N not used in the chunk. */
function freeId(chunk: Chunk, prefix: string): string {
  const used = new Set([...chunk.tiles, ...chunk.walls, ...chunk.lights].map((item) => item.id));
  let n = 1;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

function wallPrefix(wall: Pick<Wall, 'door' | 'sight'>): string {
  if (wall.door) return 'door';
  return wall.sight === false ? 'window' : 'wall';
}

function find(chunks: Chunks, key: string): Chunk {
  const chunk = chunks.get(key);
  if (!chunk) throw new MapEditError('That part of the map is not loaded');
  return chunk;
}

function addWall(chunks: Chunks, size: number, edit: Extract<MapEdit, { op: 'addWall' }>): ChunkChange[] {
  const { a, b } = edit.wall;
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) throw new MapEditError('A wall needs two different ends');
  const key = chunkOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, size);
  const chunk = chunks.get(key) ?? blank();
  const wall: Wall = { ...edit.wall, id: freeId(chunk, wallPrefix(edit.wall)) };
  return [{ key, chunk: { ...chunk, walls: [...chunk.walls, wall] } }];
}

function setWall(chunks: Chunks, edit: Extract<MapEdit, { op: 'setWall' }>): ChunkChange[] {
  const chunk = find(chunks, edit.chunk);
  if (!chunk.walls.some((w) => w.id === edit.id)) throw new MapEditError('No such wall');
  const walls = chunk.walls.map((w) => {
    if (w.id !== edit.id) return w;
    const { door: _d, sight: _s, ...plain } = w;
    return { ...plain, ...(edit.door ? { door: edit.door } : {}), ...(edit.sight === false ? { sight: false } : {}) };
  });
  return [{ key: edit.chunk, chunk: { ...chunk, walls } }];
}

function addLight(chunks: Chunks, size: number, light: Omit<PlacedLight, 'id'>, id?: string): ChunkChange {
  const key = chunkOf(light.x, light.y, size);
  const chunk = chunks.get(key) ?? blank();
  const placed = { ...light, id: id && !chunk.lights.some((l) => l.id === id) ? id : freeId(chunk, 'light') };
  return { key, chunk: { ...chunk, lights: [...chunk.lights, placed] } };
}

function moveLight(chunks: Chunks, size: number, edit: Extract<MapEdit, { op: 'moveLight' }>): ChunkChange[] {
  const from = find(chunks, edit.chunk);
  const light = from.lights.find((l) => l.id === edit.id);
  if (!light) throw new MapEditError('No such light');
  const left: Chunk = { ...from, lights: from.lights.filter((l) => l !== light) };
  const moved = { ...light, x: edit.to[0], y: edit.to[1] };
  const target = chunkOf(moved.x, moved.y, size);
  if (target === edit.chunk)
    return [{ key: target, chunk: { ...from, lights: from.lights.map((l) => (l === light ? moved : l)) } }];
  const arrived = addLight(new Map([...chunks, [edit.chunk, left]]), size, moved, light.id);
  return [{ key: edit.chunk, chunk: left }, arrived];
}

function remove(chunks: Chunks, edit: Extract<MapEdit, { op: 'remove' }>): ChunkChange[] {
  const chunk = find(chunks, edit.chunk);
  const walls = chunk.walls.filter((w) => w.id !== edit.id);
  const lights = chunk.lights.filter((l) => l.id !== edit.id);
  if (walls.length === chunk.walls.length && lights.length === chunk.lights.length)
    throw new MapEditError('Nothing to erase there');
  return [{ key: edit.chunk, chunk: { ...chunk, walls, lights } }];
}

/** The chunks an edit changes. Throws MapEditError when it can't be made. */
export function applyMapEdit(chunks: Chunks, chunkSize: number, edit: MapEdit): ChunkChange[] {
  switch (edit.op) {
    case 'addWall':
      return addWall(chunks, chunkSize, edit);
    case 'setWall':
      return setWall(chunks, edit);
    case 'addLight':
      return [addLight(chunks, chunkSize, edit.light)];
    case 'moveLight':
      return moveLight(chunks, chunkSize, edit);
    case 'remove':
      return remove(chunks, edit);
  }
}

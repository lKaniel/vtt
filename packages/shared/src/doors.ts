import type { Chunk, DoorState, Wall } from './schema.ts';

// Doors: what players are shown of secret doors, and the sound a door makes
// when it swings or its lock turns.

/**
 * The wall as a player is shown it: a closed secret door is a plain wall
 * (no door, nothing saying it is secret); the GM sees it as it is.
 */
export function wallFor(wall: Wall, gm: boolean): Wall {
  if (gm || !wall.secret) return wall;
  const { door, secret: _secret, ...plain } = wall;
  return door === 'open' ? { ...plain, door } : plain;
}

/** A map chunk as a player is shown it: secret doors hidden from all but the GM. */
export function chunkFor(chunk: Chunk, gm: boolean): Chunk {
  if (gm || !chunk.walls.some((w) => w.secret)) return chunk;
  return { ...chunk, walls: chunk.walls.map((w) => wallFor(w, false)) };
}

/** Sounds a door can make without a file of its own (drawn up by the client). */
export const DOOR_SOUNDS = ['wood', 'stone', 'iron', 'gate'] as const;

/** What a door makes when it changes. */
export type DoorSwing = 'open' | 'close' | 'lock' | 'unlock';

function swingOf(from: DoorState, to: DoorState): DoorSwing | undefined {
  if (from === to) return undefined;
  if (to === 'open') return 'open';
  if (from === 'open') return 'close';
  return to === 'locked' ? 'lock' : 'unlock';
}

/** The doors that changed from one version of a chunk to the next; nothing for a chunk seen for the first time. */
export function doorSwings(before: Chunk | undefined, after: Chunk): { wall: Wall; swing: DoorSwing }[] {
  if (!before) return [];
  const was = new Map(before.walls.map((w) => [w.id, w.door]));
  const out: { wall: Wall; swing: DoorSwing }[] = [];
  for (const wall of after.walls) {
    const from = was.get(wall.id);
    const swing = from && wall.door && swingOf(from, wall.door);
    if (swing) out.push({ wall, swing });
  }
  return out;
}

/** The sound a door makes: a built-in one (wooden by default), a file, or none. */
export function doorSoundOf(wall: Wall): string | undefined {
  const sound = wall.doorSound ?? 'wood';
  return sound === 'none' ? undefined : sound;
}

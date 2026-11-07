import { distToSegment, type Point, type Wall } from '@vtt/shared';
import type { GameStore } from '../store/game-store.ts';
import { Refusal } from './table.ts';

// Knock and arcane lock: the spell works on the door nearest the point the
// caster aimed at, within half a square of it. Secret doors count once found
// (open); a hidden one stays hidden.

export interface DoorPick {
  chunk: string;
  wall: Wall;
}

/** The door nearest `point`, within half a square; hidden secret doors don't count. */
function nearestDoor(store: GameStore, point: Point): DoorPick | undefined {
  const reach = store.world.gridSize / 2;
  const doors = [...store.chunks].flatMap(([chunk, c]) =>
    c.walls
      .filter((w) => w.door && !w.secret)
      .map((wall) => ({ chunk, wall, d: distToSegment(point, wall.a, wall.b) })),
  );
  return doors.filter((p) => p.d <= reach).sort((a, b) => a.d - b.d)[0];
}

/** The door a door spell aimed at `point` works on; refused when there is none it can change. */
export function doorAt(store: GameStore, point: Point, how: 'unlock' | 'lock'): DoorPick {
  const best = nearestDoor(store, point);
  if (!best) throw new Refusal('There is no door there');
  if (how === 'unlock' && best.wall.door !== 'locked') throw new Refusal('That door isn’t locked');
  if (how === 'lock' && best.wall.door !== 'closed') throw new Refusal('Close the door before locking it');
  return best;
}

/** Opens the door (knock) or locks it (arcane lock). */
export function setDoor(store: GameStore, { chunk, wall }: DoorPick, how: 'unlock' | 'lock'): void {
  const c = store.chunks.get(chunk);
  if (!c) return;
  const state = how === 'unlock' ? 'open' : 'locked';
  store.setChunk(chunk, { ...c, walls: c.walls.map((w) => (w.id === wall.id ? { ...w, door: state } : w)) });
}

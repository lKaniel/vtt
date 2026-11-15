import type { MapCollection } from './chunks.ts';
import type { Chunk, ScenePart } from './schema.ts';

// A combined scene (scene.json `parts`) is made of other scenes laid on it,
// each at its own place: a city of quarters. Every part stays a scene of its
// own, edited and optimised by itself; the whole is played as one map. The
// server lays each part's tiles, walls and lights on the whole (`intoWhole`:
// moved to the part's place, under an id no other part has, marked `part`)
// and saves a change to one of them back in its part (`intoPart`).

/** What the id of a part's item is on the whole scene. */
export const partId = (part: string, id: string): string => `${part}--${id}`;

type Item<C extends MapCollection> = Chunk[C][number];
type Loose = Record<string, unknown> & { id: string };

/** The fields that name another item of the same scene. */
const REFS = ['parent', 'tile'] as const;

function mapped(
  coll: MapCollection,
  item: Loose,
  [dx, dy]: readonly [number, number],
  name: (id: string) => string,
): Loose {
  const out: Loose = { ...item, id: name(item.id) };
  for (const ref of REFS) if (typeof out[ref] === 'string') out[ref] = name(out[ref]);
  const door = out.door as { wall?: unknown } | string | undefined;
  if (door && typeof door === 'object' && typeof door.wall === 'string') out.door = { ...door, wall: name(door.wall) };
  if (coll === 'walls') {
    const { a, b } = item as unknown as { a: [number, number]; b: [number, number] };
    return { ...out, a: [a[0] + dx, a[1] + dy], b: [b[0] + dx, b[1] + dy] };
  }
  const { x, y } = item as unknown as { x: number; y: number };
  return { ...out, x: x + dx, y: y + dy };
}

/** A part's item as it lies on the whole scene. */
export function intoWhole<C extends MapCollection>(coll: C, item: Item<C>, part: ScenePart): Item<C> {
  const placed = mapped(coll, item, [part.x, part.y], (id) => partId(part.scene, id));
  return { ...placed, part: part.scene } as unknown as Item<C>;
}

/** An item of the whole scene as its part keeps it. */
export function intoPart<C extends MapCollection>(coll: C, item: Item<C>, part: ScenePart): Item<C> {
  const cut = part.scene.length + 2;
  const { part: _part, ...own } = mapped(coll, item, [-part.x, -part.y], (id) => id.slice(cut));
  return own as unknown as Item<C>;
}

interface PartScene {
  gridSize?: number;
  parts?: readonly ScenePart[];
}

/** What is wrong with the parts scene `id` names, in words; `scenes`: every scene of the game. */
export function partErrors(id: string, scenes: ReadonlyMap<string, PartScene>): string[] {
  const whole = scenes.get(id);
  const seen = new Set<string>();
  return (whole?.parts ?? []).flatMap((p) => {
    const twice = seen.has(p.scene);
    seen.add(p.scene);
    return twice ? [`part "${p.scene}" is placed twice`] : onePart(id, whole!, p.scene, scenes);
  });
}

function onePart(id: string, whole: PartScene, name: string, scenes: ReadonlyMap<string, PartScene>): string[] {
  if (name === id) return ['a scene cannot be a part of itself'];
  const part = scenes.get(name);
  if (!part) return [`part "${name}" is not a scene of this game`];
  if (part.parts?.length) return [`part "${name}" is made of parts itself`];
  if (part.gridSize !== whole.gridSize)
    return [`part "${name}" has a grid of ${part.gridSize} px, the scene ${whole.gridSize} px`];
  return [];
}

/** Whether scene `part` can be added to the parts of scene `id`: another scene with its grid, not laid on it yet, with no parts of its own. */
export function canBePart(id: string, part: string, scenes: ReadonlyMap<string, PartScene>): boolean {
  const whole = scenes.get(id);
  const laid = whole?.parts?.some((p) => p.scene === part) ?? false;
  return !!whole && !laid && onePart(id, whole, part, scenes).length === 0;
}

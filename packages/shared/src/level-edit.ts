import type { Doc, DocRef, Patch } from '@vtt/core';
import { SCENE_COLLECTIONS } from './scene-colls.ts';
import type { SceneLevel } from './schema.ts';

// The GM's floors editor (scene settings): adding a floor on top of the
// others, renaming one or moving its heights, and taking one away, with
// what stood on it then on every floor.

/** How tall a new floor is, feet. */
const STOREY = 10;

const ceiling = (l: SceneLevel) => l.top ?? l.bottom + STOREY;

/** A new floor on top of the highest (the first is the ground floor, 0 to 10 ft). */
export function addLevel(levels: readonly SceneLevel[] | undefined): SceneLevel[] {
  const now = levels ?? [];
  if (!now.length) return [{ id: 'ground', name: 'Ground', bottom: 0, top: STOREY }];
  const bottom = Math.max(...now.map(ceiling));
  let n = now.length + 1;
  while (now.some((l) => l.id === `floor-${n}`)) n++;
  return [...now, { id: `floor-${n}`, name: `Floor ${n}`, bottom, top: bottom + STOREY }];
}

/** Changes one floor: a blank name is kept as it was, an empty `sees` goes. */
export function editLevel(
  levels: readonly SceneLevel[],
  id: string,
  patch: Partial<Omit<SceneLevel, 'id'>>,
): SceneLevel[] {
  return levels.map((l) => {
    if (l.id !== id) return l;
    const name = patch.name?.trim() === '' ? undefined : patch.name?.trim();
    const next = { ...l, ...patch, name: name ?? l.name };
    if (!next.sees?.length) delete next.sees;
    return next;
  });
}

/** The floors without `id`; those that looked down on it no longer do. */
export function removeLevel(levels: readonly SceneLevel[], id: string): SceneLevel[] {
  return levels
    .filter((l) => l.id !== id)
    .map((l) => (l.sees?.includes(id) ? editLevel([l], l.id, { sees: l.sees.filter((s) => s !== id) })[0]! : l));
}

interface Source {
  all(coll: string): Doc[];
}

/** What stood on floor `id` of `scene`, taken off it: on every floor, or on the others it was on. */
export function offLevelUpdates(src: Source, scene: string, id: string): { ref: DocRef; patch: Patch }[] {
  return SCENE_COLLECTIONS.flatMap((name) => {
    const coll = `${scene}/${name}`;
    return src.all(coll).flatMap((d) => {
      const patch = offLevel(d, id);
      return patch ? [{ ref: { coll, id: d.id }, patch }] : [];
    });
  });
}

function offLevel(doc: Doc, id: string): Patch | undefined {
  if (doc.level === id) return { level: null };
  const levels = Array.isArray(doc.levels) ? (doc.levels as string[]) : [];
  if (!levels.includes(id)) return undefined;
  const rest = levels.filter((l) => l !== id);
  return { levels: rest.length ? rest : null };
}

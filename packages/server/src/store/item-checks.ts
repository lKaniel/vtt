import type { Doc } from '@vtt/core';
import type { SceneLevel } from '@vtt/shared';

// Problems with a scene's placeables that need more than their own file:
// levels they name that the scene lacks, notes on missing journal entries,
// regions that teleport to missing scenes.

export interface ItemIssue {
  file: string;
  message: string;
}

interface SceneRefs {
  levels: readonly SceneLevel[] | undefined;
  journals: (id: string) => boolean;
  scenes: (id: string) => boolean;
}

type Items = Record<string, readonly { id: string; level?: string; levels?: readonly string[] }[] | undefined>;

const NOUN: Record<string, string> = {
  tiles: 'tile',
  walls: 'wall',
  lights: 'light',
  drawings: 'drawing',
  notes: 'note',
  templates: 'template',
  regions: 'region',
  sounds: 'sound',
};

function levelIssues(items: Items, levels: ReadonlySet<string>): [string, string][] {
  return Object.entries(NOUN).flatMap(([coll, noun]) =>
    (items[coll] ?? []).flatMap((item) =>
      [...(item.level ? [item.level] : []), ...(item.levels ?? [])]
        .filter((l) => !levels.has(l))
        .map((l): [string, string] => [coll, `${noun} "${item.id}": unknown level "${l}"`]),
    ),
  );
}

/** Levels seen from a level that the scene lacks. */
function seenIssues(refs: SceneRefs, levels: ReadonlySet<string>): [string, string][] {
  return (refs.levels ?? []).flatMap((l) =>
    (l.sees ?? [])
      .filter((id) => !levels.has(id))
      .map((id): [string, string] => ['scene', `level "${l.id}": sees unknown level "${id}"`]),
  );
}

function noteIssues(items: Items, refs: SceneRefs): [string, string][] {
  const notes = (items.notes ?? []) as readonly (Doc & { entry?: string })[];
  return notes
    .filter((n) => n.entry && !refs.journals(n.entry))
    .map((n) => ['notes', `note "${n.id}": unknown journal entry "${n.entry}"`]);
}

interface Behavior {
  type: string;
  scene?: string;
  to?: unknown;
  between?: unknown;
  floors?: unknown;
}

/** The levels a behaviour takes a token to. */
function levelsNamed(b: Behavior): string[] {
  if (b.type === 'level') return typeof b.to === 'string' ? [b.to] : [];
  if (b.type === 'stairs' || b.type === 'elevator') {
    const ids = b.type === 'stairs' ? b.between : b.floors;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  }
  return [];
}

function regionIssues(items: Items, refs: SceneRefs, levels: ReadonlySet<string>): [string, string][] {
  const regions = (items.regions ?? []) as readonly { id: string; behaviors?: Behavior[] }[];
  return regions.flatMap((r) =>
    (r.behaviors ?? []).flatMap((b): [string, string][] => {
      if (b.type === 'teleport' && b.scene && !refs.scenes(b.scene))
        return [['regions', `region "${r.id}": unknown scene "${b.scene}"`]];
      return levelsNamed(b)
        .filter((id) => !levels.has(id))
        .map((id): [string, string] => ['regions', `region "${r.id}": unknown level "${id}"`]);
    }),
  );
}

/** The problems of one scene's placeables, each naming its file. */
export function sceneItemIssues(scene: string, items: Items, refs: SceneRefs): ItemIssue[] {
  const levels = new Set((refs.levels ?? []).map((l) => l.id));
  return [
    ...seenIssues(refs, levels),
    ...levelIssues(items, levels),
    ...noteIssues(items, refs),
    ...regionIssues(items, refs, levels),
  ].map(([coll, message]) => ({ file: `scenes/${scene}/${coll}.json`, message }));
}

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

type Items = Record<string, readonly { id: string; level?: string }[] | undefined>;

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
    (items[coll] ?? [])
      .filter((item) => item.level && !levels.has(item.level))
      .map((item): [string, string] => [coll, `${noun} "${item.id}": unknown level "${item.level}"`]),
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
}

function regionIssues(items: Items, refs: SceneRefs, levels: ReadonlySet<string>): [string, string][] {
  const regions = (items.regions ?? []) as readonly { id: string; behaviors?: Behavior[] }[];
  return regions.flatMap((r) =>
    (r.behaviors ?? []).flatMap((b): [string, string][] => {
      if (b.type === 'teleport' && b.scene && !refs.scenes(b.scene))
        return [['regions', `region "${r.id}": unknown scene "${b.scene}"`]];
      if (b.type === 'level' && typeof b.to === 'string' && !levels.has(b.to))
        return [['regions', `region "${r.id}": unknown level "${b.to}"`]];
      return [];
    }),
  );
}

/** The problems of one scene's placeables, each naming its file. */
export function sceneItemIssues(scene: string, items: Items, refs: SceneRefs): ItemIssue[] {
  const levels = new Set((refs.levels ?? []).map((l) => l.id));
  return [...levelIssues(items, levels), ...noteIssues(items, refs), ...regionIssues(items, refs, levels)].map(
    ([coll, message]) => ({ file: `scenes/${scene}/${coll}.json`, message }),
  );
}

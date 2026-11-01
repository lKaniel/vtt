import { type Doc, type Op } from '@vtt/core';
import { z } from 'zod';
import { SceneSchema } from './game-schema.ts';
import { PlacedLightSchema, TileSchema, WallSchema } from './schema.ts';
import { DrawingSchema, NoteSchema, RegionSchema, SoundSchema, TemplateSchema } from './scene-items.ts';
import { appendedScene } from './scenes.ts';

// A scene in a pack's "scene" compendium (a Foundry import makes these): a
// scene.json with its tiles, walls, lights, drawings, notes, templates,
// regions and sounds in it. Importing one makes a new scene in the game, as
// one edit the GM can undo.

export const SceneEntrySchema = SceneSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  tiles: z.array(TileSchema).default([]),
  walls: z.array(WallSchema).default([]),
  lights: z.array(PlacedLightSchema).default([]),
  drawings: z.array(DrawingSchema).default([]),
  notes: z.array(NoteSchema).default([]),
  templates: z.array(TemplateSchema).default([]),
  regions: z.array(RegionSchema).default([]),
  sounds: z.array(SoundSchema).default([]),
});
export type SceneEntry = z.infer<typeof SceneEntrySchema>;

interface Source {
  get(coll: string, id: string): Doc | undefined;
  all(coll: string): Doc[];
}

const PARTS = {
  tiles: 'tile',
  walls: 'wall',
  lights: 'light',
  drawings: 'drawing',
  notes: 'note',
  templates: 'template',
  regions: 'region',
  sounds: 'sound',
} as const;

/** Ops making `entry` a new scene at the end of the Scenes list. */
export function importSceneOps(src: Source, entry: SceneEntry): { id: string; ops: Op[] } {
  const { id: _id, tiles, walls, lights, drawings, notes, templates, regions, sounds, ...settings } = entry;
  const { id, sort } = appendedScene(src, entry.name);
  const scene: Doc = { ...settings, type: 'scene', id, rev: 0, sort };
  const placed = { tiles, walls, lights, drawings, notes, templates, regions, sounds };
  const parts = (Object.keys(PARTS) as (keyof typeof PARTS)[]).flatMap((coll) =>
    (placed[coll] as { id: string }[]).map((item): Op => ({
      op: 'create',
      coll: `${id}/${coll}`,
      doc: { ...item, type: PARTS[coll], rev: 0 },
    })),
  );
  return { id, ops: [{ op: 'create', coll: 'scenes', doc: scene }, ...parts] };
}

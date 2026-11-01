import { DocStore } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { importSceneOps, sceneList, SceneEntrySchema } from './index.ts';

const cave = SceneEntrySchema.parse({
  id: 'cave',
  name: 'Goblin Cave',
  gridSize: 140,
  chunkSize: 1960,
  darkness: 0.8,
  tiles: [
    {
      id: 'background',
      kind: 'image',
      x: 0,
      y: 0,
      w: 1400,
      h: 1400,
      src: 'pack://caves/media/cave.webp',
      background: true,
    },
  ],
  walls: [{ id: 'wall-1', a: [0, 0], b: [140, 0] }],
  lights: [{ id: 'light-1', x: 70, y: 70, bright: 20, dim: 40 }],
  notes: [{ id: 'note-1', x: 70, y: 70, label: 'Altar' }],
  sounds: [{ id: 'sound-1', x: 70, y: 70, radius: 30, src: 'pack://caves/media/drip.ogg' }],
  drawings: [{ id: 'drawing-1', shape: 'text', x: 0, y: 0, w: 140, h: 40, text: 'Here be goblins' }],
  regions: [
    {
      id: 'region-1',
      points: [
        [0, 0],
        [140, 0],
        [0, 140],
      ],
      behaviors: [{ type: 'difficult' }],
    },
  ],
});

describe('a scene from a compendium', () => {
  it('reads like a scene.json with its tiles, walls and lights in it', () => {
    expect(cave).toMatchObject({ gridSize: 140, vision: true, tiles: [{ kind: 'image' }] });
    expect(SceneEntrySchema.safeParse({ id: 'x', name: 'X', walls: [{ id: 'w', a: [0, 0] }] }).success).toBe(false);
  });

  it('goes into the game as a new scene, last in the list, with everything on it', () => {
    const docs = new DocStore();
    docs.apply([{ op: 'create', coll: 'scenes', doc: { type: 'scene', id: 'cave', rev: 0, name: 'Cave', sort: 'a' } }]);
    const { id, ops } = importSceneOps(docs, cave);
    docs.apply(ops);
    expect(id).toBe('goblin-cave');
    expect(sceneList(docs).map((d) => d.id)).toEqual(['cave', 'goblin-cave']);
    expect(docs.get('scenes', id)).toMatchObject({ type: 'scene', name: 'Goblin Cave', gridSize: 140, darkness: 0.8 });
    expect(docs.get('scenes', id)).not.toHaveProperty('tiles');
    expect(docs.get(`${id}/tiles`, 'background')).toMatchObject({ type: 'tile', src: 'pack://caves/media/cave.webp' });
    expect(docs.get(`${id}/walls`, 'wall-1')).toMatchObject({ type: 'wall', b: [140, 0] });
    expect(docs.get(`${id}/lights`, 'light-1')).toMatchObject({ type: 'light', bright: 20 });
    expect(docs.get(`${id}/notes`, 'note-1')).toMatchObject({ type: 'note', label: 'Altar' });
    expect(docs.get(`${id}/sounds`, 'sound-1')).toMatchObject({ type: 'sound', radius: 30 });
    expect(docs.get(`${id}/drawings`, 'drawing-1')).toMatchObject({ type: 'drawing', text: 'Here be goblins' });
    expect(docs.get(`${id}/regions`, 'region-1')).toMatchObject({ type: 'region', behaviors: [{ type: 'difficult' }] });
  });
});

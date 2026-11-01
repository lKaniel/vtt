import { type Doc, DocStore } from '@vtt/core';
import { copyRefs, duplicateSceneOps, gridSizePatch, newSceneOps, pasteAt, sceneList } from './index.ts';
import { describe, expect, it } from 'vitest';

function store(): DocStore {
  const docs = new DocStore();
  const put = (coll: string, doc: Partial<Doc> & { id: string; type: string }) =>
    docs.apply([{ op: 'create', coll, doc: { rev: 0, ...doc } }]);
  put('scenes', { type: 'scene', id: 'main', name: 'Main', sort: 'a' });
  put('scenes', { type: 'scene', id: 'cellar', name: 'Cellar', sort: 'b' });
  put('main/tiles', { type: 'tile', id: 'house', kind: 'rect', x: 0, y: 0, w: 100, h: 100 });
  put('main/tiles', { type: 'tile', id: 'rug', kind: 'rect', x: 10, y: 10, w: 10, h: 10, parent: 'house' });
  put('main/walls', { type: 'wall', id: 'w', a: [0, 0], b: [100, 0] });
  put('main/tokens', { type: 'token', id: 'hero', name: 'Hero', x: 50, y: 50, actor: 'hero' });
  put('cellar/tokens', { type: 'token', id: 'rat', name: 'Rat', x: 50, y: 50 });
  put('main/drawings', { type: 'drawing', id: 'x-marks', shape: 'rect', x: 0, y: 0, w: 50, h: 50 });
  put('main/notes', { type: 'note', id: 'pin', x: 10, y: 10 });
  put('main/sounds', { type: 'sound', id: 'brook', x: 10, y: 10, radius: 30, src: 'a.ogg' });
  return docs;
}

describe('scenes', () => {
  it('lists scenes in their order', () => {
    expect(sceneList(store()).map((d) => d.id)).toEqual(['main', 'cellar']);
  });

  it('makes a new scene with a readable id, last in the list', () => {
    const docs = store();
    const { id, ops } = newSceneOps(docs, 'Goblin Cave');
    expect(id).toBe('goblin-cave');
    docs.apply(ops);
    expect(sceneList(docs).map((d) => d.id)).toEqual(['main', 'cellar', 'goblin-cave']);
    expect(docs.get('scenes', id)).toMatchObject({ name: 'Goblin Cave', gridSize: 100 });
    expect(newSceneOps(docs, 'Goblin Cave').id).toBe('goblin-cave-2');
  });

  it('duplicates a scene with everything on it, where it was, with token ids of their own', () => {
    const docs = store();
    const { id, ops } = duplicateSceneOps(docs, 'main');
    docs.apply(ops);
    expect(id).toBe('main-copy');
    expect(docs.get('scenes', id)).toMatchObject({ name: 'Main (copy)' });
    expect(docs.get(`${id}/tiles`, 'rug')).toMatchObject({ parent: 'house', x: 10 });
    expect(docs.get(`${id}/walls`, 'w')).toMatchObject({ a: [0, 0] });
    expect(docs.get(`${id}/drawings`, 'x-marks')).toMatchObject({ w: 50 });
    expect(docs.get(`${id}/notes`, 'pin')).toMatchObject({ x: 10 });
    expect(docs.get(`${id}/sounds`, 'brook')).toMatchObject({ radius: 30 });
    const tokens = docs.all(`${id}/tokens`);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ id: 'hero-1', actor: 'hero', x: 50 });
  });

  it('changes the square size with a chunk size that is a whole number of squares', () => {
    expect(gridSizePatch(75)).toEqual({ gridSize: 75, chunkSize: 2025 });
    expect(gridSizePatch(140)).toEqual({ gridSize: 140, chunkSize: 1960 });
    expect(gridSizePatch(3)).toEqual({ gridSize: 10, chunkSize: 2000 });
  });

  it('keeps token ids unique across scenes when pasting', () => {
    const docs = store();
    const clip = copyRefs(docs, [{ coll: 'cellar/tokens', id: 'rat' }]);
    const { ids } = pasteAt(docs, clip, { scene: 'main', offset: [0, 0] });
    expect(ids).toEqual(['rat-1']);
  });
});

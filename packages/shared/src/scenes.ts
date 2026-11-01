import { freeId, keyBetween, slugify, type Doc, type DocRef, type Op, type Patch } from '@vtt/core';
import { copyRefs, pasteAt } from './edit-kinds.ts';

// The Scenes list's commands as document ops: a new scene, a copy of one
// with everything on it, in the list's order. Deleting is one op on the
// scene; the server takes what is on it along (server/scene-ops.ts).

interface Source {
  get(coll: string, id: string): Doc | undefined;
  all(coll: string): Doc[];
  collections?(): string[];
}

const SCENES = 'scenes';
const PLACEABLES = ['tiles', 'walls', 'lights', 'tokens'];

const sortOf = (d: Doc) => (typeof d.sort === 'string' ? d.sort : '');
const nameOf = (d: Doc) => (typeof d.name === 'string' ? d.name : d.id);

/** The scenes in the order the list shows them: by `sort`, then by name. */
export function sceneList(src: Source): Doc[] {
  return src.all(SCENES).sort((a, b) => sortOf(a).localeCompare(sortOf(b)) || nameOf(a).localeCompare(nameOf(b)));
}

function lastKey(src: Source): string {
  const last = sceneList(src).at(-1);
  const sort = last ? sortOf(last) : '';
  return keyBetween(sort === '' ? null : sort, null);
}

function freeSceneId(src: Source, name: string): string {
  return freeId(slugify(name), (id) => !!src.get(SCENES, id), { bare: true });
}

/** A new, empty scene called `name` at the end of the list. */
export function newSceneOps(src: Source, name: string): { id: string; ops: Op[] } {
  const id = freeSceneId(src, name);
  const doc: Doc = {
    type: 'scene',
    id,
    rev: 0,
    name,
    sort: lastKey(src),
    gridSize: 100,
    chunkSize: 2000,
    start: [1000, 1000],
    darkness: 0,
    vision: true,
  };
  return { id, ops: [{ op: 'create', coll: SCENES, doc }] };
}

/** A copy of scene `from` with everything on it, in the same places, at the end of the list. */
export function duplicateSceneOps(src: Source, from: string): { id: string; ops: Op[] } {
  const scene = src.get(SCENES, from);
  if (!scene) return { id: from, ops: [] };
  const id = freeSceneId(src, `${from}-copy`);
  const copy: Doc = { ...scene, id, rev: 0, name: `${nameOf(scene)} (copy)`, sort: lastKey(src) };
  const refs: DocRef[] = PLACEABLES.flatMap((coll) =>
    src.all(`${from}/${coll}`).map((d) => ({ coll: `${from}/${coll}`, id: d.id })),
  );
  const { ops } = pasteAt(src, copyRefs(src, refs), { scene: id, offset: [0, 0] });
  return { id, ops: [{ op: 'create', coll: SCENES, doc: copy }, ...ops] };
}

/** A new square size, with the chunk size nearest 2000 px that is a whole number of squares. */
export function gridSizePatch(gridSize: number): Patch {
  const size = Math.max(10, Math.round(gridSize));
  return { gridSize: size, chunkSize: size * Math.max(1, Math.round(2000 / size)) };
}

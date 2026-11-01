import type { Doc } from '@vtt/core';
import { CLOCK_COLL, CLOCK_ID, type MapCollection, SCENE_TYPES, type World } from '@vtt/shared';
import { ENTRY_COLLS, isEntryColl } from './entry-files.ts';
import { toDoc } from './doc-sync.ts';
import type { FileKind, GameFile } from './game-files.ts';

// How a game folder's files map onto document-store collections.
// Collections in the document store. A scene's placeables live in
// "<scene>/<collection>", e.g. "crossroads/walls".
export const GAME = 'game';
export const SCENES = 'scenes';
export const ACTORS = 'actors';
export const COMBAT = 'combat';
export const FIGHT = 'current';
/** time.json: the game clock (see clock.ts in shared). */
export const CLOCK = CLOCK_COLL;
export const MAP: MapCollection[] = ['tiles', 'walls', 'lights'];
export const TYPE = SCENE_TYPES;

/** Where a file's documents go, and which of them it covers (all of `coll`, or just `only`). */
export function docsOf(file: GameFile): { coll: string; only?: string; docs: Doc[] } {
  switch (file.kind) {
    case 'game':
      return { coll: GAME, docs: [toDoc('game', file.data)] };
    case 'combat':
      return { coll: COMBAT, docs: [toDoc('combat', file.data, FIGHT)] };
    case 'time':
      return { coll: CLOCK, docs: [toDoc('clock', file.data, CLOCK_ID)] };
    case 'actor':
      return { coll: ACTORS, only: file.id, docs: [toDoc('actor', file.data)] };
    case 'scene':
      return { coll: SCENES, only: file.scene, docs: [toDoc('scene', file.data, file.scene)] };
    case 'collection':
      return { coll: `${file.scene}/${file.coll}`, docs: file.data.map((item) => toDoc(TYPE[file.coll], item)) };
    case 'entry':
      return { coll: file.coll, only: file.id, docs: [toDoc(ENTRY_COLLS[file.coll].type, file.data)] };
  }
}

/** The file a document is saved in. */
export function fileOf(coll: string, id: string): FileKind {
  if (coll === GAME || coll === COMBAT) return { kind: coll };
  if (coll === CLOCK) return { kind: 'time' };
  if (coll === ACTORS) return { kind: 'actor', id };
  if (coll === SCENES) return { kind: 'scene', scene: id };
  if (isEntryColl(coll)) return { kind: 'entry', coll, id };
  const [scene, name] = coll.split('/') as [string, keyof typeof TYPE];
  return { kind: 'collection', scene, coll: name };
}

/** The document collection a deleted file emptied, and which of its documents it held. */
export function scopeOf(kind: FileKind): { coll: string; only?: string } | undefined {
  if (kind.kind === 'game' || kind.kind === 'scene') return undefined;
  if (kind.kind === 'actor') return { coll: ACTORS, only: kind.id };
  if (kind.kind === 'combat') return { coll: COMBAT };
  if (kind.kind === 'time') return { coll: CLOCK };
  if (kind.kind === 'entry') return { coll: kind.coll, only: kind.id };
  return { coll: `${kind.scene}/${kind.coll}` };
}

/** True when two scenes' settings differ in nothing but the time of day (the game's own settings aside). */
export function sameScene(a: World, b: World): boolean {
  const scene = ({ players: _p, name: _n, rules: _r, darkness: _d, ...rest }: World) => JSON.stringify(rest);
  return scene(a) === scene(b);
}

import type { Doc } from '@vtt/core';
import type { MapCollection } from '@vtt/shared';
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
export const MAP: MapCollection[] = ['tiles', 'walls', 'lights'];
export const TYPE = { tiles: 'tile', walls: 'wall', lights: 'light', tokens: 'token' } as const;

/** Where a file's documents go, and which of them it covers (all of `coll`, or just `only`). */
export function docsOf(file: GameFile): { coll: string; only?: string; docs: Doc[] } {
  switch (file.kind) {
    case 'game':
      return { coll: GAME, docs: [toDoc('game', file.data)] };
    case 'combat':
      return { coll: COMBAT, docs: [toDoc('combat', file.data, FIGHT)] };
    case 'actor':
      return { coll: ACTORS, only: file.id, docs: [toDoc('actor', file.data)] };
    case 'scene':
      return { coll: SCENES, only: file.scene, docs: [toDoc('scene', file.data, file.scene)] };
    case 'collection':
      return { coll: `${file.scene}/${file.coll}`, docs: file.data.map((item) => toDoc(TYPE[file.coll], item)) };
  }
}

/** The file a document is saved in. */
export function fileOf(coll: string, id: string): FileKind {
  if (coll === GAME || coll === COMBAT) return { kind: coll };
  if (coll === ACTORS) return { kind: 'actor', id };
  if (coll === SCENES) return { kind: 'scene', scene: id };
  const [scene, name] = coll.split('/') as [string, keyof typeof TYPE];
  return { kind: 'collection', scene, coll: name };
}

/** The document collection a deleted file emptied, and which of its documents it held. */
export function scopeOf(kind: FileKind): { coll: string; only?: string } | undefined {
  if (kind.kind === 'game' || kind.kind === 'scene') return undefined;
  if (kind.kind === 'actor') return { coll: ACTORS, only: kind.id };
  if (kind.kind === 'combat') return { coll: COMBAT };
  return { coll: `${kind.scene}/${kind.coll}` };
}

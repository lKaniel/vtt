import type { Doc } from '@vtt/core';
import { laidDocs, laidPartsOf, type WorldInfo } from '@vtt/shared';

/** What reading the scene's placed things takes of the session. */
export interface LaidHost {
  docs: { all(coll: string): readonly Doc[] };
  scene: string;
  world?: Pick<WorldInfo, 'parts' | 'partFloors'>;
}

/**
 * The regions, notes, sounds or drawings on the scene you are on. On a
 * combined scene (scene-parts.ts in shared) those of its parts are among
 * them, each where its part lies; they are edited on the part's own scene.
 */
export function laid(s: LaidHost, name: 'regions' | 'notes' | 'sounds' | 'drawings'): Doc[] {
  return laidDocs({ id: s.scene, parts: laidPartsOf(s.world) }, name, (coll) => s.docs.all(coll));
}

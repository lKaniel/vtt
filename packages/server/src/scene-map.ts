import type { Doc } from '@vtt/core';
import { isGroup, tileOrder, type Chunk } from '@vtt/shared';
import { fromDoc } from './doc-sync.ts';

// The tiles a scene streams to clients: groups only hold tiles, so they
// aren't sent; every drawn tile carries `z`, its place in the draw order of
// the whole scene, so tiles in different chunks stack the right way.

export function drawnTiles(docs: readonly Doc[]): Chunk['tiles'] {
  const drawn = tileOrder(docs).filter((d) => !isGroup(d));
  return drawn.map((d, z) => ({ ...fromDoc<Chunk['tiles'][number]>(d), z }));
}

/** True when a tile change can move other tiles in the draw order: every tile's `z` is then sent again. */
export function reordersTiles(before: Doc | undefined, after: Doc | undefined): boolean {
  if (!before || !after) return true;
  return before.sort !== after.sort || before.parent !== after.parent;
}

import { type BakeGroup, bakeBlocksOver, bakeZoomFor, type Rect } from '@vtt/shared';

// Which blocks of a floor's picture pyramid (scene-bake.ts in shared) the
// map shows: those of the zoom the screen needs over the view, and while one
// loads, the nearest coarser block already in. The block holding the whole
// floor is always asked for, so something shows from the start. Keys are
// "<zoom>/<x>_<y>". Pure; BakedGround.ts draws them.

/** `want`: the blocks to have loaded; `show`: those to draw, coarse ones first (they go under). */
export function blocksToShow(
  group: BakeGroup,
  { scale, screenPerMap, view }: { scale: number; screenPerMap: number; view: Rect },
  loaded: (key: string) => boolean,
): { want: string[]; show: string[] } {
  const zoom = bakeZoomFor(screenPerMap, scale, group.zooms);
  const top = `${group.zooms - 1}/0_0`;
  const has = (z: number, x: number, y: number) => group.blocks[z]?.includes(`${x}_${y}`) ?? false;
  const want = bakeBlocksOver(group, scale, zoom, view)
    .filter(([x, y]) => has(zoom, x, y))
    .map(([x, y]) => `${zoom}/${x}_${y}`);
  if (!want.includes(top)) want.push(top);
  const show = new Set<string>();
  for (const key of want) {
    const found = nearestLoaded(key, group.zooms, loaded);
    if (found) show.add(found);
  }
  const zoomOf = (key: string) => Number(key.split('/')[0]);
  return { want, show: [...show].sort((a, b) => zoomOf(b) - zoomOf(a)) };
}

/** The block itself if loaded, else its nearest loaded coarser block. */
function nearestLoaded(key: string, zooms: number, loaded: (key: string) => boolean): string | undefined {
  const [z, place] = key.split('/') as [string, string];
  const [x, y] = place.split('_').map(Number) as [number, number];
  for (let up = 0; Number(z) + up < zooms; up++) {
    const at = `${Number(z) + up}/${x >> up}_${y >> up}`;
    if (loaded(at)) return at;
  }
  return undefined;
}

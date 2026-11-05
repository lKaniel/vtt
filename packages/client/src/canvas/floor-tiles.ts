import { type Chunk, levelRank, onLevel, onLevels, type SceneLevel } from '@vtt/shared';

// Which tiles the flat map draws for the floor shown, as Foundry's Levels
// does: the floors seen from it (lower ones beneath), and the floors above
// it standing over it as roofs that fade while you are under them. A
// floor's own pictures lie under your feet, even those Levels keeps
// overhead (the upper floor's picture, a trapdoor), and the roofs over
// every floor stay on top of all of them.

type Tile = Chunk['tiles'][number];

/** Each floor up draws over the ones below it. */
const LEVEL_Z = 1e7;

const named = (t: Tile) => !!(t.level ?? t.levels?.length);

/** The tiles drawn for the floor `current` (with `shown` the floors in view), with their `z` and roofs set; everything as it is when no floor is picked. */
export function tilesOnFloor(
  tiles: readonly Tile[],
  levels: readonly SceneLevel[] | undefined,
  shown: readonly string[] | undefined,
  current: string | undefined,
): Tile[] {
  if (!shown) return [...tiles];
  const sorted = [...(levels ?? [])].sort((a, b) => a.bottom - b.bottom);
  const here = sorted.find((l) => l.id === current);
  const above = sorted.filter((l) => here && l.bottom > here.bottom).map((l) => l.id);
  const top = sorted.length + 1;
  const rankIn = (t: Tile, ids: readonly string[]) =>
    Math.max(0, ...ids.filter((l) => onLevel(t, l)).map((l) => levelRank(levels, l)));
  return tiles.flatMap((t, i) => {
    const z = t.z ?? i;
    if (!named(t)) return [{ ...t, z: (overhead(t) ? top : 0) * LEVEL_Z + z }];
    const over = above.some((l) => onLevel(t, l));
    if (onLevels(t, shown)) return [withRoof({ ...t, z: rankIn(t, shown) * LEVEL_Z + z }, overhead(t) && over)];
    return over ? [withRoof({ ...t, z: rankIn(t, above) * LEVEL_Z + z }, true)] : [];
  });
}

const overhead = (t: Tile) => t.kind === 'image' && !!t.overhead;

function withRoof(t: Tile, roof: boolean): Tile {
  if (t.kind !== 'image' || !!t.overhead === roof) return t;
  if (roof) return { ...t, overhead: true };
  const { overhead: _, ...rest } = t;
  return rest;
}

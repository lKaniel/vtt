import type { TileRepeat } from '@vtt/shared';

// Token Magic FX's "sprite" filter with `repeat`, as Baileywiki's Unlimited
// Terrain uses it: a tileable picture drawn endlessly across the tile, cut
// to the tile's own picture. Its UVs are copies of the picture (at its own
// size, with `maintainScale`) about the tile's middle: divided by `scale`,
// turned by `rotation` and shifted by `translation`, which is what
// TileRepeat keeps.

const obj = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

/** The first repeating sprite filter's settings on a Foundry tile. */
function spriteOf(raw: unknown): Record<string, unknown> | undefined {
  const filters = obj(obj(raw).flags).tokenmagic;
  const list = obj(filters).filters;
  return (Array.isArray(list) ? list : [])
    .map((f) => obj(obj(obj(f).tmFilters).tmParams))
    .find((p) => p.filterType === 'sprite' && p.repeat === true && typeof p.imagePath === 'string');
}

/** A tile's Unlimited Terrain, if it has one whose picture we have. */
export function repeatOf(raw: unknown, find: (path: string) => string | undefined): { repeat?: TileRepeat } {
  const p = spriteOf(raw);
  const src = p && find(p.imagePath as string);
  if (!p || !src) return {};
  const scale = num(p.scaleX) ?? num(p.scale);
  const [x, y, rotation] = [num(p.translationX), num(p.translationY), num(p.rotation)];
  return {
    repeat: {
      src,
      ...(scale && scale > 0 && scale !== 1 ? { scale } : {}),
      ...(x ? { x } : {}),
      ...(y ? { y } : {}),
      ...(rotation ? { rotation } : {}),
    },
  };
}

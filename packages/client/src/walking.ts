import { inTheWay, type Token, type TokenView } from '@vtt/system-dnd5e';
import {
  bodyOf,
  type EditorMode,
  isGridless,
  type Point,
  snapToGrid,
  type WalkOptions,
  type WorldInfo,
} from '@vtt/shared';

type Scene = Pick<WorldInfo, 'gridSize' | 'grid'>;

/** Where a click at `hover` sends a token: the very point, or its square on a grid. */
export function aimPoint(hover: Point, world: Scene): Point {
  return isGridless(world) ? hover : snapToGrid(hover, world.gridSize);
}

/** How `mover` walks, around the creatures this player knows of: the same rules the server walks it by. */
export function walkOptions(world: Scene, mover: Token, tokens: Iterable<TokenView>): WalkOptions {
  const g = world.gridSize;
  return {
    gridSize: g,
    gridless: isGridless(world),
    radius: bodyOf(mover, g).r,
    bodies: inTheWay(mover, tokens).map((t) => bodyOf(t, g)),
  };
}

/** Whether a drag in the map editor goes to any point, as if Shift were held: tokens, on a scene without a grid. */
export function dragsFreely(mode: EditorMode, world: Scene | undefined): boolean {
  return mode === 'tokens' && !!world && isGridless(world);
}

import { inTheWay, type Token, type TokenView } from '@vtt/system-dnd5e';
import type { Session } from '../session/session.ts';
import { tokenAt } from './drops.ts';
import {
  bodyOf,
  type EditorMode,
  isGridless,
  type Point,
  sceneLattice,
  snapToCell,
  type WalkOptions,
  type WorldInfo,
} from '@vtt/shared';

type Scene = Pick<WorldInfo, 'gridSize' | 'grid'>;

/** Where a click at `hover` sends a token: the very point, or its cell on a grid. */
export function aimPoint(hover: Point, world: Scene): Point {
  const lattice = sceneLattice(world);
  return lattice ? snapToCell(hover, lattice) : hover;
}

/** How `mover` walks, around the creatures this player knows of: the same rules the server walks it by. */
export function walkOptions(world: Scene, mover: Token, tokens: Iterable<TokenView>): WalkOptions {
  const g = world.gridSize;
  return {
    gridSize: g,
    gridless: isGridless(world),
    lattice: sceneLattice(world),
    radius: bodyOf(mover, g).r,
    bodies: inTheWay(mover, tokens).map((t) => bodyOf(t, g)),
  };
}

/** Whether a drag in the map editor goes to any point, as if Shift were held: tokens, on a scene without a grid. */
export function dragsFreely(mode: EditorMode, world: Scene | undefined): boolean {
  return mode === 'tokens' && !!world && isGridless(world);
}

/** Where the pointer is and what it's doing, for `previewToken`. */
interface Pointer {
  hover?: Point;
  /** A press being dragged: a token, or the map being panned. */
  drag?: { token: boolean; panning: boolean };
  /** A map editor mode other than tokens is in use. */
  editing: boolean;
}

/**
 * The token whose path or aim the map previews: the selected one while it is
 * dragged or aims a spell or attack, or while the pointer rests on open
 * ground and you control it (its walk there, as in BG3).
 */
export function previewToken(s: Session, p: Pointer): TokenView | undefined {
  const token = s.selected ? s.tokens.get(s.selected) : undefined;
  if (!token || p.drag?.panning) return undefined;
  const acting = !!p.drag?.token || !!s.actions.armed || !!s.actions.aiming;
  return acting || walksOnHover(s, token, p) ? token : undefined;
}

function walksOnHover(s: Session, token: TokenView, { hover, drag, editing }: Pointer): boolean {
  if (drag || editing || !hover || !s.world) return false;
  if (s.editor.mode !== 'tokens' || !s.canControl(token)) return false;
  return !tokenAt(s.tokens.values(), hover, s.world.gridSize);
}

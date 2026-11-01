import type { Doc } from '@vtt/core';
import { isGroup, tileChildren, withDescendants } from '@vtt/shared';

// The layers panel (Figma's left panel) for tiles: rows topmost first with
// what is in each under it, and where a row dragged onto another lands.

export interface LayerRow {
  id: string;
  label: string;
  depth: number;
  group: boolean;
  locked: boolean;
  ground: boolean;
  /** It holds tiles. */
  parent: boolean;
  /** Its tiles are listed (not folded away). */
  open: boolean;
}

/** Rows topmost first; tiles inside a folded parent are left out. */
export function layerRows(tiles: readonly Doc[], folded: ReadonlySet<string>): LayerRow[] {
  const out: LayerRow[] = [];
  const walk = (parent: string | undefined, depth: number): void => {
    for (const t of tileChildren(tiles, parent).reverse()) {
      const kids = tileChildren(tiles, t.id).length > 0;
      const open = kids && !folded.has(t.id);
      out.push({
        id: t.id,
        label: (t.name as string | undefined) ?? t.id,
        depth,
        group: isGroup(t),
        locked: t.locked === true,
        ground: t.background === true,
        parent: kids,
        open,
      });
      if (open && depth < 32) walk(t.id, depth + 1);
    }
  };
  walk(undefined, 0);
  return out;
}

/** Where on a row something was dropped: its upper edge, lower edge or middle. */
export type DropZone = 'above' | 'below' | 'inside';

/** The parent and index (bottom up, without the moved tiles) a drop puts `moving` at, or undefined if it can't go there. */
export function dropPlace(
  tiles: readonly Doc[],
  moving: readonly string[],
  target: string,
  zone: DropZone,
): { parent: string | undefined; index: number } | undefined {
  if (withDescendants(tiles, moving).includes(target)) return undefined;
  const doc = tiles.find((t) => t.id === target);
  if (!doc) return undefined;
  const holds = isGroup(doc) || doc.background !== true;
  if (zone === 'inside' && holds) {
    const kids = tileChildren(tiles, target).filter((t) => !moving.includes(t.id));
    return { parent: target, index: kids.length };
  }
  const parent = doc.parent as string | undefined;
  const shown = parent !== undefined && tiles.some((t) => t.id === parent) ? parent : undefined;
  const siblings = tileChildren(tiles, shown).filter((t) => !moving.includes(t.id));
  const at = siblings.findIndex((t) => t.id === target);
  return { parent: shown, index: zone === 'below' ? at : at + 1 };
}

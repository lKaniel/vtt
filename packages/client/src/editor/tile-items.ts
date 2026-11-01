import type { Doc } from '@vtt/core';
import {
  hitTest,
  isGroup,
  isTileLocked,
  pickUnit,
  tileBounds,
  tileChildren,
  tileOrder,
  withDescendants,
  type Hittable,
  type MarqueeMode,
  type Point,
} from '@vtt/shared';
import { keyOf, refOf } from './selection.ts';

// What the tiles mode picks, Figma style: a click on a tile in a group picks
// the group (or, inside a group a double click entered, the child of it);
// a marquee takes whole groups; locked tiles let clicks and marquees through;
// ground only moves once it is selected, so a drag over it draws a marquee.

export class TileItems {
  /** For clicks: every drawn tile that takes clicks, bottom to top, keyed by what a click on it selects. */
  readonly pick: Hittable[];
  /** Every drawn tile that takes clicks, keyed by itself. */
  private leaves: Hittable[];

  constructor(
    private tiles: readonly Doc[],
    private coll: string,
    private scope: string | undefined,
  ) {
    const drawn = tileOrder(tiles).filter((t) => !isGroup(t) && !isTileLocked(tiles, t.id));
    this.leaves = drawn.map((t) => ({ key: t.id, shape: { kind: 'rect', ...tileBounds(tiles, t.id)! } }));
    this.pick = this.leaves.map((h) => ({ ...h, key: this.key(pickUnit(tiles, h.key, scope)) }));
  }

  /** The parent of the first selected tile: clicks then pick among its children. */
  static scopeOf(tiles: readonly Doc[], selected: readonly string[]): string | undefined {
    const first = tiles.find((t) => t.id === selected[0]);
    const parent = first?.parent as string | undefined;
    return parent !== undefined && tiles.some((t) => t.id === parent) ? parent : undefined;
  }

  private key(id: string): string {
    return keyOf({ coll: this.coll, id });
  }

  /** For marquees: the children of the scope by their bounds; ground only when held whole. */
  units(mode: MarqueeMode): Hittable[] {
    return tileChildren(this.tiles, this.scope).flatMap((t) => {
      const r = tileBounds(this.tiles, t.id);
      if (!r || isTileLocked(this.tiles, t.id) || (mode === 'touch' && t.background === true)) return [];
      return [{ key: this.key(t.id), shape: { kind: 'rect' as const, ...r } }];
    });
  }

  draggable(key: string): boolean {
    return this.tiles.find((t) => t.id === refOf(key).id)?.background !== true;
  }

  /** What a double click on `key` at `at` selects instead: the child of it under the pointer. */
  enter(key: string, at: Point): string | undefined {
    const unit = refOf(key).id;
    const within = new Set(withDescendants(this.tiles, [unit]));
    const leaf = hitTest(
      this.leaves.filter((h) => h.key !== unit && within.has(h.key)),
      at,
      0,
    );
    return leaf === undefined ? undefined : this.key(pickUnit(this.tiles, leaf, unit));
  }
}

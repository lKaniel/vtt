import type { DoorState, DrawnTile, Point } from './schema.ts';
import type { TriggerAction } from './trigger-schema.ts';

// Tile triggers, like Monk's Active Tiles: a tile runs a chain of actions
// (trigger-schema.ts) when it is clicked or walked onto. The server runs them
// (trigger-actions.ts); players are told only that a tile can be clicked.

type DoorTo = Extract<TriggerAction, { type: 'door' }>['to'];

/** Whether a tile's trigger can go off now. */
export function tileWorks(tile: DrawnTile): boolean {
  return !!tile.trigger && !tile.trigger.disabled;
}

/** Whether this client may click the tile: a working click trigger, a GM-only one for the GM alone. */
export function tileClickable(tile: DrawnTile, gm: boolean): boolean {
  return tileWorks(tile) && tile.trigger!.on === 'click' && (gm || !tile.trigger!.gmOnly);
}

/** The picture after `src` in `images`, round and round; the first when the tile shows none of them. */
export function nextImage(src: string, images: readonly string[]): string {
  const at = images.indexOf(src);
  return images[(at + 1) % images.length]!;
}

/** The state a door action leaves a door in: toggling opens a shut (or locked) door and shuts an open one. */
export function doorAfter(now: DoorState, to: DoorTo): DoorState {
  if (to !== 'toggle') return to;
  return now === 'open' ? 'closed' : 'open';
}

function onTile(tile: DrawnTile, [x, y]: Point): boolean {
  return x >= tile.x && x <= tile.x + tile.w && y >= tile.y && y <= tile.y + tile.h;
}

/** The working enter-trigger tiles a walk along `path` stepped onto, nearest first; not the one it started on. */
export function tilesEntered(tiles: readonly DrawnTile[], path: readonly Point[]): { tile: DrawnTile; at: number }[] {
  if (!path.length) return [];
  const out: { tile: DrawnTile; at: number }[] = [];
  for (const tile of tiles) {
    if (tile.trigger?.on !== 'enter' || !tileWorks(tile) || onTile(tile, path[0]!)) continue;
    const at = path.findIndex((p) => onTile(tile, p));
    if (at > 0) out.push({ tile, at });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** A tile as a player is shown it: a click trigger they may use, with no word of what it does; nothing else. */
export function tileFor<T extends DrawnTile>(tile: T): T {
  const { trigger, ...rest } = tile;
  if (!trigger) return tile;
  return (tileClickable(tile, false) ? { ...rest, trigger: { on: 'click', actions: [] } } : rest) as T;
}

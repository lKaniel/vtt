import { srdFor, type TokenView } from '@vtt/shared';
import { actionTiles, type ActionTile } from './actions.ts';
import { itemArt } from './icon-art.ts';
import { itemIcon } from './icons.ts';

// The "everything" page of the action bar is a hotbar the player arranges:
// a list of slots saved on the token (`hotbar`), each naming a tile by
// reference ("spell:fire-bolt", "item:potion-of-healing") or empty.
// Anything the creature can do that isn't on the bar yet fills the gaps.

export const HOTBAR_SIZE = 30;
const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export type Slots = (string | null)[];

/** The reference a slot stores for a tile. */
export function tileRef(tile: ActionTile): string {
  if (tile.kind === 'attack') return `attack:${tile.name}`;
  if (tile.kind === 'spell') return `spell:${tile.spell.id}`;
  if (tile.kind === 'feature') return `feature:${tile.feature.id}`;
  return `item:${tile.item.id}`;
}

/** An inventory item as a tile, if the creature carries it. */
function itemTile(token: TokenView, id: string): ActionTile | undefined {
  const entry = token.inventory?.find((e) => e.item === id);
  const item = entry && srdFor('2014').items.get(id);
  if (!entry || !item) return undefined;
  const tile: ActionTile = {
    kind: 'item',
    name: item.name,
    icon: { ...itemIcon(item), art: itemArt(item) },
    spent: false,
    item,
  };
  return entry.qty > 1 ? { ...tile, uses: String(entry.qty) } : tile;
}

/** The bar's slots, padded to HOTBAR_SIZE, with hotkeys 1-0 on the first ten. */
export function hotbarTiles(token: TokenView): (ActionTile | null)[] {
  const auto = new Map(actionTiles(token).map((t) => [tileRef(t), t]));
  const resolve = (ref: string | null) => {
    if (!ref) return undefined;
    return ref.startsWith('item:') ? itemTile(token, ref.slice(5)) : auto.get(ref);
  };
  const slots: (ActionTile | null)[] = (token.hotbar ?? []).map((ref) => resolve(ref) ?? null);
  const placed = new Set(slots.filter((t) => t !== null).map(tileRef));
  for (const [ref, tile] of auto) {
    if (placed.has(ref)) continue;
    const gap = slots.indexOf(null);
    if (gap >= 0) slots[gap] = tile;
    else slots.push(tile);
  }
  while (slots.length < HOTBAR_SIZE) slots.push(null);
  return slots.map((t, i) => t && { ...t, hotkey: HOTKEYS[i] });
}

/** The refs of the bar as it's shown, ready to be changed and saved. */
export const hotbarSlots = (token: TokenView): Slots => hotbarTiles(token).map((t) => (t ? tileRef(t) : null));

const padded = (slots: Slots, n: number): Slots => [
  ...slots,
  ...Array<null>(Math.max(0, n + 1 - slots.length)).fill(null),
];

/** Swaps the slots at `from` and `to`. */
export function moveOnHotbar(slots: Slots, from: number, to: number): Slots {
  const out = padded(slots, Math.max(from, to));
  [out[from], out[to]] = [out[to]!, out[from]!];
  return out;
}

/** Puts `ref` in slot `to`, taking it out of wherever it was; what was in `to` goes there instead. */
export function placeOnHotbar(slots: Slots, ref: string, to: number): Slots {
  const from = slots.indexOf(ref);
  if (from >= 0) return moveOnHotbar(slots, from, to);
  const out = padded(slots, to);
  out[to] = ref;
  return out;
}

export function removeFromHotbar(slots: Slots, at: number): Slots {
  return slots.map((s, i) => (i === at ? null : s));
}

/** The data type of a tile dragged from the sheet or the bar: `{ ref }` from the sheet, `{ from }` from a bar slot. */
export const TILE_DRAG = 'application/x-vtt-tile';
export type TileDrag = { ref: string } | { from: number };

export function dragTile(e: React.DragEvent, payload: TileDrag): void {
  e.dataTransfer.setData(TILE_DRAG, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
  // While a tile is in the air the sheet fades and lets drops through to the bar under it.
  // Changing the page during dragstart cancels the drag, so wait a moment.
  setTimeout(() => document.body.classList.add('dragging-tile'));
  const done = () => {
    document.body.classList.remove('dragging-tile');
    // A tile keeps focus after a drag, which would leave its tooltip open.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };
  document.addEventListener('dragend', done, { once: true });
}

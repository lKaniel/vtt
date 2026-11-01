import { itemCost, SPELL_SCROLL, type TokenView } from '@vtt/system-dnd5e';
import { gameContent } from './content.ts';
import { actionTiles, type ActionTile } from './actions.ts';
import { itemArt, spellArt } from './icon-art.ts';
import { itemIcon, spellIcon } from './icons.ts';

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
  if (tile.kind === 'spell') return `${tile.scroll ? 'scroll' : 'spell'}:${tile.spell.id}`;
  if (tile.kind === 'feature') return `feature:${tile.feature.id}`;
  return `item:${tile.item.id}`;
}

/** An inventory item as a tile, if the creature carries it. */
function itemTile(token: TokenView, id: string): ActionTile | undefined {
  const entry = token.inventory?.find((e) => e.item === id);
  const item = entry && gameContent('2014').items.get(id);
  if (!entry || !item) return undefined;
  const tile: ActionTile = {
    kind: 'item',
    name: item.name,
    icon: { ...itemIcon(item), art: itemArt(item) },
    spent: false,
    item,
    cost: itemCost(item, token.sheet?.edition ?? '2014'),
  };
  return entry.qty > 1 ? { ...tile, uses: String(entry.qty) } : tile;
}

/** A scroll the creature carries, as a tile casting its spell. */
function scrollTile(token: TokenView, id: string): ActionTile | undefined {
  const entry = token.inventory?.find((e) => e.item === SPELL_SCROLL && e.spell === id);
  const spell = entry && gameContent(token.sheet?.edition ?? '2014').spells.get(id);
  if (!entry || !spell) return undefined;
  const icon = { ...spellIcon(spell), art: spellArt(spell) };
  return {
    kind: 'spell',
    name: `Scroll of ${spell.name}`,
    icon,
    spent: false,
    spell,
    slot: spell.level,
    scroll: true,
    uses: String(entry.qty),
  };
}

/** A tile placed on the bar by hand: an item or a scroll. */
function placedTile(token: TokenView, ref: string): ActionTile | undefined {
  if (ref.startsWith('item:')) return itemTile(token, ref.slice(5));
  if (ref.startsWith('scroll:')) return scrollTile(token, ref.slice(7));
  return undefined;
}

/** The bar's slots, padded to HOTBAR_SIZE, with hotkeys 1-0 on the first ten. */
export function hotbarTiles(token: TokenView): (ActionTile | null)[] {
  const auto = new Map(actionTiles(token).map((t) => [tileRef(t), t]));
  const resolve = (ref: string | null) => {
    if (!ref) return undefined;
    return placedTile(token, ref) ?? auto.get(ref);
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

type Size = [number, number];
type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

/** Where a lifted tile sits: centred on the cursor and a little larger. */
export function floatTransform([x, y]: [number, number], [w, h]: Size, scale: number): string {
  return `translate(${x - w / 2}px, ${y - h / 2}px) scale(${scale})`;
}

/** Where a dropped tile lands: centred in its slot at its own size. */
export function landTransform(slot: Box, [w, h]: Size): string {
  return `translate(${slot.left + (slot.width - w) / 2}px, ${slot.top + (slot.height - h) / 2}px) scale(1)`;
}

const LIFT = 1.15;
const LAND_MS = 140;
// The browser's own drag picture is a faint snapshot (tooltip and all); a blank one hides it.
const BLANK =
  typeof Image === 'undefined'
    ? undefined
    : Object.assign(new Image(), {
        src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      });
let landing: Box | undefined;

/** Call from a drop target: the tile in the air flies into this element before it goes. */
export function landOn(el: Element): void {
  landing = el.getBoundingClientRect();
}

/** A copy of the dragged element that follows the cursor until the drag ends. */
function lift(e: React.DragEvent): void {
  const source = e.currentTarget as HTMLElement;
  const { width, height } = source.getBoundingClientRect();
  const size: Size = [width, height];
  const float = source.cloneNode(true) as HTMLElement;
  for (const tip of float.querySelectorAll('.tip')) tip.remove();
  float.className += ' drag-float';
  float.style.width = `${width}px`;
  float.style.height = `${height}px`;
  float.style.transform = floatTransform([e.clientX, e.clientY], size, LIFT);
  if (BLANK) e.dataTransfer.setDragImage(BLANK, 0, 0);
  const follow = (ev: DragEvent) => {
    float.style.transform = floatTransform([ev.clientX, ev.clientY], size, LIFT);
  };
  document.addEventListener('dragover', follow);
  setTimeout(() => {
    document.body.append(float);
    source.classList.add('drag-source');
  });
  const end = () => {
    document.removeEventListener('dragover', follow);
    source.classList.remove('drag-source');
    if (landing) float.style.transform = landTransform(landing, size);
    float.classList.add(landing ? 'landing' : 'vanishing');
    landing = undefined;
    setTimeout(() => float.remove(), LAND_MS);
  };
  document.addEventListener('dragend', end, { once: true });
}

export function dragTile(e: React.DragEvent, payload: TileDrag): void {
  e.dataTransfer.setData(TILE_DRAG, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
  lift(e);
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

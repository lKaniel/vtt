import {
  COINS,
  containerLoad,
  type Currency,
  type Edition,
  type Encumbrance,
  type InventoryEntry,
  type Own,
  SPELL_SCROLL,
  withOwn,
} from '@vtt/system-dnd5e';
import { gameContent } from './content.ts';
import type { DragPayload } from './drops.ts';
import { itemArt, spellArt } from './icon-art.ts';
import { type Icon, itemIcon, spellIcon } from './icons.ts';
import { itemTip, spellTip, type Tip } from './tooltip.ts';

// An inventory entry as the sheet shows it. Spell scrolls show their spell:
// read one from the action bar like a spell; drag one to hand it over.

export interface CarriedLook {
  name: string;
  icon: Icon;
  tip: Tip;
  /** What the action bar stores for it. */
  ref: string;
}

/** How an entry looks in the inventory of a creature playing by `rules` (with the things made on its `sheet`). */
export function carriedLook(entry: InventoryEntry, rules: Edition, sheet: { own?: Own } = {}): CarriedLook {
  const content = withOwn(gameContent(rules), sheet);
  const item = content.items.get(entry.item);
  const spell = entry.item === SPELL_SCROLL && entry.spell ? content.spells.get(entry.spell) : undefined;
  if (spell) {
    const name = `${item?.name ?? 'Spell Scroll'} of ${spell.name}`;
    const tip = spellTip(spell);
    return {
      name,
      icon: { ...spellIcon(spell), art: spellArt(spell) },
      tip: { ...tip, title: name, subtitle: `${tip.subtitle} scroll` },
      ref: `scroll:${spell.id}`,
    };
  }
  return {
    name: item?.name ?? entry.item,
    icon: { ...itemIcon(item), art: itemArt(item) },
    tip: itemTip(item, entry.item, entry.equipped),
    ref: `item:${entry.item}`,
  };
}

/** The drag that hands `entry` from creature `from` to another. */
export function carriedDrag(from: string, { item, spell }: InventoryEntry): DragPayload {
  return { kind: 'carried', from, item, ...(spell && { spell }) };
}

export interface BagBox {
  /** The container's inventory index. */
  index: number;
  name: string;
  /** Indexes of the entries inside it. */
  contents: number[];
  load: number;
  capacity: number;
}

/** The inventory as the sheet lays it out: loose gear (containers too), and each container's contents. */
export function bagLayout(
  list: readonly InventoryEntry[],
  rules: Edition,
  sheet: { own?: Own } = {},
): { loose: number[]; boxes: BagBox[] } {
  const items = withOwn(gameContent(rules), sheet).items;
  const boxes: BagBox[] = list.flatMap((e, index) => {
    const item = items.get(e.item);
    if (item?.type !== 'gear' || !item.container) return [];
    const contents = e.id ? list.flatMap((c, i) => (c.in === e.id ? [i] : [])) : [];
    const load = e.id ? containerLoad({ inventory: [...list] }, e.id, { ...gameContent(rules), items }) : 0;
    return [{ index, name: item.name, contents, load, capacity: item.container.capacity }];
  });
  const inside = new Set(boxes.flatMap((b) => b.contents));
  return { loose: list.flatMap((_, i) => (inside.has(i) ? [] : [i])), boxes };
}

/** "12 gp · 3 sp", biggest coins first. */
export function purseText(currency: Currency | undefined): string {
  const parts = COINS.filter((c) => (currency?.[c] ?? 0) > 0).map((c) => `${currency![c]} ${c}`);
  return parts.length ? parts.join(' · ') : 'No coins';
}

export function loadText({ weight, capacity }: Encumbrance): string {
  return `${Math.round(weight * 10) / 10} / ${capacity} lb`;
}

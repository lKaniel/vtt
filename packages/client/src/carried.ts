import { type Edition, type InventoryEntry, SPELL_SCROLL } from '@vtt/system-dnd5e';
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

/** How an entry looks in the inventory of a creature playing by `rules`. */
export function carriedLook(entry: InventoryEntry, rules: Edition): CarriedLook {
  const content = gameContent(rules);
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

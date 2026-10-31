import { srdFor, type Edition, type Item, type Monster, type Spell } from '@vtt/shared';
import type { DragPayload } from './drops.ts';
import { spellTip } from './tooltip.ts';

// The GM's Compendium: the bundled SRD monsters, gear and spells as
// searchable lists. Every entry can be dragged onto the map.

export const CATEGORIES = ['monsters', 'weapons', 'armor', 'gear', 'spells'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Entry {
  id: string;
  name: string;
  /** One line under the name, e.g. "CR 1/4 humanoid". */
  sub: string;
  drag: DragPayload;
}

const FRACTIONS: Record<number, string> = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };
export const crText = (cr: number) => FRACTIONS[cr] ?? String(cr);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function monsterEntry(m: Monster, rules: Edition): Entry {
  const sub = [`CR ${crText(m.cr)}`, m.type].filter(Boolean).join(' ');
  return { id: m.id, name: m.name, sub, drag: { kind: 'monster', id: m.id, rules } };
}

function itemSub(item: Item): string {
  if (item.type === 'weapon') return `${cap(item.category)} ${item.kind} · ${item.damage.dice} ${item.damage.type}`;
  if (item.type === 'armor')
    return item.category === 'shield' ? `Shield · +${item.ac} AC` : `${cap(item.category)} armour · AC ${item.ac}`;
  return item.description ?? 'Gear';
}

function itemEntry(item: Item): Entry {
  return { id: item.id, name: item.name, sub: itemSub(item), drag: { kind: 'item', id: item.id } };
}

function spellEntry(s: Spell, rules: Edition): Entry {
  return { id: s.id, name: s.name, sub: spellTip(s).subtitle, drag: { kind: 'spell', id: s.id, rules } };
}

const ITEM_TYPE = { weapons: 'weapon', armor: 'armor', gear: 'gear' } as const;

function entries(category: Category, rules: Edition): Entry[] {
  const srd = srdFor(rules);
  if (category === 'monsters') return [...srd.monsters.values()].map((m) => monsterEntry(m, rules));
  if (category === 'spells') return [...srd.spells.values()].map((s) => spellEntry(s, rules));
  return [...srd.items.values()].filter((i) => i.type === ITEM_TYPE[category]).map(itemEntry);
}

/** 0 for a name that starts with the query, 1 for the rest. */
const rank = (e: Entry, q: string) => (e.name.toLowerCase().startsWith(q) ? 0 : 1);

/** One category of the `rules` book whose names contain every word of `query`: names starting with it first. */
export function compendium(category: Category, rules: Edition, query: string): Entry[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  return entries(category, rules)
    .filter((e) => words.every((w) => e.name.toLowerCase().includes(w)))
    .sort((a, b) => rank(a, q) - rank(b, q) || a.name.localeCompare(b.name));
}

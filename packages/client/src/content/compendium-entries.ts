import type { PackCompendium } from '@vtt/core';
import type { Class, Content, Edition, Item, Monster, Spell } from '@vtt/system-dnd5e';
import type { DragPayload } from '../play/drops.ts';
import { featureArt, itemArt, monsterArt, spellArt } from '../icon-art.ts';
import { featureIcon, type Icon, itemIcon, spellIcon } from '../icons.ts';
import { spellTip } from '../text/tooltip.ts';

// One Compendium entry per monster, item, spell and class feature of a game's
// content, with its picture, where it comes from, and the values the
// Compendium's filters sort it by (compendium.ts).

/** What an entry can be filtered by. Values are what the filter shows, except `cr` and `level` (numbers). */
export type Facet =
  | 'kind'
  | 'source'
  | 'cr'
  | 'type'
  | 'level'
  | 'school'
  | 'class'
  | 'category'
  | 'range'
  | 'damage'
  | 'use'
  | 'casting'
  | 'tag';

export interface Entry {
  id: string;
  /** Unique in its list (class features share ids across classes). */
  key: string;
  name: string;
  /** One line under the name, e.g. "CR 1/4 humanoid". */
  sub: string;
  drag: DragPayload;
  /** Painted art when there is some, else a glyph on a tinted disc. */
  icon: Icon;
  /** "SRD", or the pack (or homebrew) it comes from. */
  source: string;
  /** Challenge rating or level, for sorting by it. */
  order: number;
  facets: Partial<Record<Facet, string[]>>;
}

/** Where each monster, item, spell and class comes from, by `<type>:<id>`; the rest are the SRD's. */
type Sources = ReadonlyMap<string, string>;

export function sourcesOf(compendia: readonly PackCompendium[]): Sources {
  const out = new Map<string, string>();
  for (const c of compendia) {
    const label = c.pack === 'homebrew' ? 'Homebrew' : (c.name ?? c.pack);
    for (const doc of c.docs) {
      const id = (doc as { id?: unknown } | null)?.id;
      if (typeof id === 'string') out.set(`${c.type}:${id}`, label);
    }
  }
  return out;
}

const FRACTIONS: Record<number, string> = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };
export const crText = (cr: number) => FRACTIONS[cr] ?? String(cr);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const MONSTER_GLYPH: Icon = { glyph: 'claw', tint: 'steel' };

function monsterEntry(m: Monster, rules: Edition, sources: Sources): Entry {
  const type = m.type ? cap(m.type) : undefined;
  return {
    id: m.id,
    key: m.id,
    name: m.name,
    sub: [`CR ${crText(m.cr)}`, m.type].filter(Boolean).join(' '),
    drag: { kind: 'monster', id: m.id, rules },
    icon: { ...MONSTER_GLYPH, art: monsterArt(m) },
    source: sources.get(`monster:${m.id}`) ?? 'SRD',
    order: m.cr,
    facets: { kind: ['Monster'], cr: [String(m.cr)], ...(type && { type: [type] }) },
  };
}

function itemSub(item: Item): string {
  if (item.type === 'weapon') return `${cap(item.category)} ${item.kind} · ${item.damage.dice} ${item.damage.type}`;
  if (item.type === 'armor')
    return item.category === 'shield' ? `Shield · +${item.ac} AC` : `${cap(item.category)} armour · AC ${item.ac}`;
  return item.description ?? 'Gear';
}

const ITEM_KIND = { weapon: 'Weapon', armor: 'Armour', gear: 'Gear' } as const;

function gearUses(item: Extract<Item, { type: 'gear' }>): string[] {
  const uses = [
    item.use?.potion && 'Potion',
    item.use?.heal && 'Healing',
    item.use?.light && 'Light',
    item.container && 'Container',
    item.attunement && 'Attunement',
  ].filter((u): u is string => Boolean(u));
  return uses.length ? uses : ['Other'];
}

function itemFacets(item: Item): Entry['facets'] {
  const kind = [ITEM_KIND[item.type]];
  if (item.type === 'weapon')
    return { kind, category: [cap(item.category)], range: [cap(item.kind)], damage: [cap(item.damage.type)] };
  if (item.type === 'armor') return { kind, category: [cap(item.category)] };
  return { kind, use: gearUses(item) };
}

function itemEntry(item: Item, sources: Sources): Entry {
  return {
    id: item.id,
    key: item.id,
    name: item.name,
    sub: itemSub(item),
    drag: { kind: 'item', id: item.id },
    icon: { ...itemIcon(item), art: itemArt(item) },
    source: sources.get(`item:${item.id}`) ?? 'SRD',
    order: 0,
    facets: itemFacets(item),
  };
}

const CASTING: Record<Spell['castingTime'], string> = {
  action: 'Action',
  bonus: 'Bonus action',
  reaction: 'Reaction',
  minute: 'Minutes',
  hour: 'Hours',
};

function spellFacets(s: Spell, classes: ReadonlyMap<string, Class>): Entry['facets'] {
  const tag = [s.concentration && 'Concentration', s.ritual && 'Ritual'].filter((x): x is string => Boolean(x));
  return {
    kind: ['Spell'],
    level: [String(s.level)],
    school: [cap(s.school)],
    class: s.classes.map((c) => classes.get(c)?.name ?? cap(c)),
    damage: [...new Set(s.damage.map((d) => cap(d.type)))],
    casting: [CASTING[s.castingTime]],
    tag,
  };
}

function spellEntry(s: Spell, content: Content, sources: Sources): Entry {
  return {
    id: s.id,
    key: s.id,
    name: s.name,
    sub: spellTip(s).subtitle,
    drag: { kind: 'spell', id: s.id, rules: content.edition },
    icon: { ...spellIcon(s), art: spellArt(s) },
    source: sources.get(`spell:${s.id}`) ?? 'SRD',
    order: s.level,
    facets: spellFacets(s, content.classes),
  };
}

function featureEntries(c: Class, rules: Edition, sources: Sources): Entry[] {
  const source = sources.get(`class:${c.id}`) ?? 'SRD';
  return c.features.map((f) => ({
    id: f.id,
    key: `${c.id}/${f.id}`,
    name: f.name,
    sub: `${c.name} ${f.level}`,
    drag: { kind: 'feature', id: f.id, class: c.id, rules },
    icon: { ...featureIcon(f), art: featureArt(f) },
    source,
    order: f.level,
    facets: { kind: ['Feature'], class: [c.name], level: [String(f.level)] },
  }));
}

export const BOOKS = ['monsters', 'weapons', 'armor', 'gear', 'spells', 'features'] as const;
export type Book = (typeof BOOKS)[number];

const ITEM_TYPE = { weapons: 'weapon', armor: 'armor', gear: 'gear' } as const;

/** Every entry of one book of `content`. */
export function bookEntries(book: Book, content: Content, sources: Sources): Entry[] {
  const rules = content.edition;
  if (book === 'monsters') return [...content.monsters.values()].map((m) => monsterEntry(m, rules, sources));
  if (book === 'spells') return [...content.spells.values()].map((s) => spellEntry(s, content, sources));
  if (book === 'features') return [...content.classes.values()].flatMap((c) => featureEntries(c, rules, sources));
  return [...content.items.values()].filter((i) => i.type === ITEM_TYPE[book]).map((i) => itemEntry(i, sources));
}

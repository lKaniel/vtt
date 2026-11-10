import type { PackCompendium } from '@vtt/core';
import {
  type Class,
  type Content,
  type Edition,
  type GearUse,
  type Item,
  type Monster,
  originsFor,
  type Species,
  type Spell,
} from '@vtt/system-dnd5e';
import type { DragPayload } from '../play/drops.ts';
import { featureArt, itemArt, monsterArt, spellArt } from '../icon-art.ts';
import { featureIcon, type Icon, itemIcon, spellIcon } from '../icons.ts';
import { spellTip } from '../text/tooltip.ts';

// One Compendium entry per monster, item, spell, class feature, class and
// species of a game's
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
  | 'rarity'
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
  return [rarityText(item), groupText(item)].filter(Boolean).join(' ') || 'Gear';
}

/** "Very rare", or nothing for mundane gear. */
const rarityText = (item: Item) => (item.rarity ? cap(item.rarity.replace('-', ' ')) : '');
/** "wondrous item", "ring", "adventuring gear". */
const groupText = (item: Item) =>
  item.type === 'gear' ? (item.group ?? 'gear').replace(/-/g, ' ').replace(/^wondrous$/, 'wondrous item') : '';

/** Magic weapons and armor say what they are made from: "Rare · Martial melee · 1d8 slashing". */
function magicSub(item: Item, plain: string): string {
  return item.rarity && item.type !== 'gear' ? `${rarityText(item)} · ${plain}` : plain;
}

const ITEM_KIND = { weapon: 'Weapon', armor: 'Armour', gear: 'Gear' } as const;

function gearUses(item: Extract<Item, { type: 'gear' }>): string[] {
  const use: Partial<GearUse> = item.use ?? {};
  const uses = [
    use.potion && 'Potion',
    use.heal && 'Healing',
    use.light && 'Light',
    use.effect && 'Effect when used',
    item.container && 'Container',
    item.effect && 'Effect while worn',
    item.attunement && 'Attunement',
  ].filter((u): u is string => Boolean(u));
  return uses.length ? uses : ['Other'];
}

function itemFacets(item: Item): Entry['facets'] {
  const kind = [ITEM_KIND[item.type]];
  const rarity = [rarityText(item) || 'Mundane'];
  if (item.type === 'weapon')
    return { kind, rarity, category: [cap(item.category)], range: [cap(item.kind)], damage: [cap(item.damage.type)] };
  if (item.type === 'armor') return { kind, rarity, category: [cap(item.category)] };
  return { kind, rarity, category: [cap(groupText(item))], use: gearUses(item) };
}

function itemEntry(item: Item, sources: Sources): Entry {
  return {
    id: item.id,
    key: item.id,
    name: item.name,
    sub: magicSub(item, itemSub(item)),
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

const CLASS_GLYPH: Icon = { glyph: 'star', tint: 'steel' };
const SPECIES_GLYPH: Icon = { glyph: 'mask', tint: 'arcane' };

/** A class: dropped on a sheet it opens the level up in it. */
function classEntry(c: Class, rules: Edition, sources: Sources): Entry {
  const source = sources.get(`class:${c.id}`) ?? 'SRD';
  const drag: DragPayload = { kind: 'class', id: c.id, rules };
  const facets = { kind: ['Class'] };
  return {
    id: c.id,
    key: c.id,
    name: c.name,
    sub: `d${c.hitDie} hit die`,
    drag,
    icon: CLASS_GLYPH,
    source,
    order: 0,
    facets,
  };
}

/** A species: dropped on a sheet the creature becomes one. */
function speciesEntry(s: Species, rules: Edition): Entry {
  const sub = [`${s.speed} ft`, s.darkvision && `darkvision ${s.darkvision} ft`].filter(Boolean).join(', ');
  const drag: DragPayload = { kind: 'species', id: s.id, rules };
  return {
    id: s.id,
    key: s.id,
    name: s.name,
    sub,
    drag,
    icon: SPECIES_GLYPH,
    source: 'SRD',
    order: 0,
    facets: { kind: ['Species'] },
  };
}

export const BOOKS = ['monsters', 'weapons', 'armor', 'gear', 'spells', 'features', 'classes', 'species'] as const;
export type Book = (typeof BOOKS)[number];

const ITEM_TYPE = { weapons: 'weapon', armor: 'armor', gear: 'gear' } as const;

/** Every entry of one book of `content`. */
export function bookEntries(book: Book, content: Content, sources: Sources): Entry[] {
  const rules = content.edition;
  if (book === 'monsters') return [...content.monsters.values()].map((m) => monsterEntry(m, rules, sources));
  if (book === 'spells') return [...content.spells.values()].map((s) => spellEntry(s, content, sources));
  if (book === 'features') return [...content.classes.values()].flatMap((c) => featureEntries(c, rules, sources));
  if (book === 'classes') return [...content.classes.values()].map((c) => classEntry(c, rules, sources));
  if (book === 'species') return originsFor(rules).species.map((s) => speciesEntry(s, rules));
  return [...content.items.values()].filter((i) => i.type === ITEM_TYPE[book]).map((i) => itemEntry(i, sources));
}

import type { Content, Edition } from '@vtt/system-dnd5e';
import { BOOKS, type Book, bookEntries, type Entry, type Facet, sourcesOf } from './compendium-entries.ts';
import { gameCompendiaNow, gameContent } from './content.ts';

// The Compendium: the SRD monsters, gear, spells and class features, and
// those of the game's packs and homebrew, searchable by name (or anything an
// entry is filed under) and narrowed by filters. Every entry can be dragged
// onto the map or a character sheet.

export { crText, type Entry, type Facet } from './compendium-entries.ts';

export const CATEGORIES = ['all', ...BOOKS] as const;
export type Category = (typeof CATEGORIES)[number];

/** The filters each category offers, in the order they are shown. */
export const FACETS: Record<Category, readonly Facet[]> = {
  all: ['kind', 'source'],
  monsters: ['cr', 'type', 'source'],
  weapons: ['category', 'range', 'damage', 'source'],
  armor: ['category', 'source'],
  gear: ['use', 'source'],
  spells: ['level', 'school', 'class', 'damage', 'casting', 'tag', 'source'],
  features: ['class', 'level', 'source'],
};

/** A value picked for some of the filters. */
export type Picks = Partial<Record<Facet, string>>;
/** By name, or by challenge rating / level (then name). */
export type Sort = 'name' | 'order';

/** What the Compendium is asked for: words, filter picks and an order. */
export interface Search {
  query?: string;
  picks?: Picks;
  sort?: Sort;
}

/** Entries per content (its maps are rebuilt whenever packs or homebrew change) and book. */
const cache = new WeakMap<object, Map<Book, Entry[]>>();

function booked(book: Book, content: Content): Entry[] {
  const books = cache.get(content.items) ?? new Map<Book, Entry[]>();
  cache.set(content.items, books);
  const list = books.get(book) ?? bookEntries(book, content, sourcesOf(gameCompendiaNow()));
  books.set(book, list);
  return list;
}

function entries(category: Category, rules: Edition): Entry[] {
  const content = gameContent(rules);
  const books = category === 'all' ? BOOKS : [category];
  return books.flatMap((b) => booked(b, content));
}

const withSource = (e: Entry): Entry => ({ ...e, facets: { ...e.facets, source: [e.source] } });

const picked = (e: Entry, picks: Picks) =>
  Object.entries(picks).every(([facet, value]) => !value || e.facets[facet as Facet]?.includes(value));

/** What a word may match besides the name: the line under it and every value it is filed under. */
const haystack = (e: Entry) => [e.sub, ...Object.values(e.facets).flat()].join(' ').toLowerCase();

/** 0: the name starts with the query; 1: the name holds every word; 2: found elsewhere; -1: not found. */
function rank(e: Entry, q: string, words: string[]): number {
  const name = e.name.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (words.every((w) => name.includes(w))) return 1;
  const rest = `${name} ${haystack(e)}`;
  return words.every((w) => rest.includes(w)) ? 2 : -1;
}

/**
 * One category of the `rules` book matching a search (or just its words): names
 * starting with the query first, then names holding it, then entries filed
 * under it (a school, a creature type); by name or by CR / level within those.
 */
export function compendium(category: Category, rules: Edition, search: Search | string): Entry[] {
  const { query = '', picks = {}, sort = 'name' } = typeof search === 'string' ? { query: search } : search;
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const order = (a: Entry, b: Entry) => (sort === 'order' ? a.order - b.order : 0) || a.name.localeCompare(b.name);
  return entries(category, rules)
    .map(withSource)
    .filter((e) => picked(e, picks))
    .map((e) => ({ e, r: rank(e, q, words) }))
    .filter(({ r }) => r >= 0)
    .sort((a, b) => a.r - b.r || order(a.e, b.e))
    .map(({ e }) => e);
}

export interface Option {
  value: string;
  /** Entries of the category filed under it. */
  count: number;
}

const NUMERIC: readonly Facet[] = ['cr', 'level'];

/** The values `facet` takes in a category, each with its count: numbers in order, words alphabetically (SRD first). */
export function facetOptions(category: Category, rules: Edition, facet: Facet): Option[] {
  const counts = new Map<string, number>();
  for (const e of entries(category, rules).map(withSource))
    for (const value of e.facets[facet] ?? []) counts.set(value, (counts.get(value) ?? 0) + 1);
  const byValue = NUMERIC.includes(facet)
    ? (a: string, b: string) => Number(a) - Number(b)
    : (a: string, b: string) => Number(b === 'SRD') - Number(a === 'SRD') || a.localeCompare(b);
  return [...counts.keys()].sort(byValue).map((value) => ({ value, count: counts.get(value)! }));
}

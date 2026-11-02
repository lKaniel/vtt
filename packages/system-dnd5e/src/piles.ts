import { uniqueId } from '@vtt/shared';
import type { Content } from './content.ts';
import { COINS, type Coin, type Currency, type InventoryEntry } from './stats-schema.ts';

// Item piles, as in the Item Piles module: coins and gear moving between a
// creature and a pile of loot or a merchant (the server's pile-actions.ts).
// Prices are the book's, in gold pieces; sums are kept in copper.

const VALUE: Record<Coin, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
/** Small coins first: what a purse spends. */
const SPEND_ORDER: readonly Coin[] = ['cp', 'sp', 'ep', 'gp', 'pp'];
/** What change and earnings are counted out in. */
const CHANGE: readonly Coin[] = ['gp', 'sp', 'cp'];

/** The coins' worth in copper. */
export function cpOf(currency: Currency | undefined): number {
  return COINS.reduce((n, kind) => n + (currency?.[kind] ?? 0) * VALUE[kind], 0);
}

/** The purse without zero counts. */
function tidy(currency: Currency): Currency {
  return Object.fromEntries(Object.entries(currency).filter(([, n]) => n));
}

/** `cp` more copper's worth, counted out in gold, silver and copper. */
export function earn(currency: Currency | undefined, cp: number): Currency {
  const out: Currency = { ...currency };
  let left = cp;
  for (const kind of CHANGE) {
    const n = Math.floor(left / VALUE[kind]);
    left -= n * VALUE[kind];
    out[kind] = (out[kind] ?? 0) + n;
  }
  return tidy(out);
}

/** The purse after paying `cp`, small coins first with change given back; undefined when it is too little. */
export function pay(currency: Currency | undefined, cp: number): Currency | undefined {
  if (cpOf(currency) < cp) return undefined;
  const out: Currency = { ...currency };
  let owed = cp;
  for (const kind of SPEND_ORDER) {
    if (owed <= 0) break;
    const take = Math.min(out[kind] ?? 0, Math.ceil(owed / VALUE[kind]));
    out[kind] = (out[kind] ?? 0) - take;
    owed -= take * VALUE[kind];
  }
  return earn(tidy(out), -owed);
}

/** `coins` handed from one purse to another, kind by kind. */
export function moveCoins(
  from: Currency | undefined,
  to: Currency | undefined,
  coins: Currency,
): { from: Currency; to: Currency } | { problem: string } {
  const out = { from: { ...from }, to: { ...to } };
  for (const kind of COINS) {
    const n = coins[kind] ?? 0;
    const have = out.from[kind] ?? 0;
    if (n > have) return { problem: `There are only ${have} ${kind}` };
    out.from[kind] = have - n;
    out.to[kind] = (out.to[kind] ?? 0) + n;
  }
  return { from: tidy(out.from), to: tidy(out.to) };
}

/** The entries inside the container entry `id`, nested ones too. */
function contentsOf(list: readonly InventoryEntry[], id: string | undefined): InventoryEntry[] {
  if (!id) return [];
  return list.filter((e) => e.in === id).flatMap((e) => [e, ...contentsOf(list, e.id)]);
}

/** `qty` of the entry at `index` taken out of `list`: a container comes with what is in it. */
export function takeOut(
  list: readonly InventoryEntry[],
  index: number,
  qty: number,
): { moved: InventoryEntry[]; rest: InventoryEntry[] } | { problem: string } {
  const entry = list[index];
  if (!entry) return { problem: 'There is no such item' };
  if (qty > entry.qty) return { problem: `There are only ${entry.qty}` };
  const inside = contentsOf(list, entry.id);
  if (qty < entry.qty && !inside.length) {
    return { moved: [{ ...entry, qty }], rest: list.map((e) => (e === entry ? { ...e, qty: e.qty - qty } : e)) };
  }
  const gone = new Set([entry, ...inside]);
  return { moved: [entry, ...inside], rest: list.filter((e) => !gone.has(e)) };
}

const sameKind = (a: InventoryEntry, b: InventoryEntry) => a.item === b.item && a.spell === b.spell;

/** `moved` (an entry and what is in it) put loose into `list`, unequipped: onto a stack, or with ids that don't clash. */
export function putIn(list: readonly InventoryEntry[], moved: readonly InventoryEntry[]): InventoryEntry[] {
  const [top, ...inside] = moved;
  if (!top) return [...list];
  const { in: _in, attuned: _a, ...loose } = { ...top, equipped: false };
  const stack = !inside.length && list.findIndex((e) => !e.in && !e.id && sameKind(e, loose));
  if (typeof stack === 'number' && stack >= 0) {
    return list.map((e, i) => (i === stack ? { ...e, qty: e.qty + loose.qty } : e));
  }
  const taken = new Set(list.flatMap((e) => (e.id ? [e.id] : [])));
  const renamed = new Map<string, string>();
  const rename = (id: string | undefined) => (id ? (renamed.get(id) ?? id) : undefined);
  for (const e of moved) {
    if (!e.id) continue;
    const id = uniqueId(e.id, (c) => taken.has(c));
    taken.add(id);
    renamed.set(e.id, id);
  }
  const fix = (e: InventoryEntry): InventoryEntry => ({
    ...e,
    ...(e.id && { id: rename(e.id) }),
    ...(e.in && { in: rename(e.in) }),
  });
  return [...list, fix(loose), ...inside.map(fix)];
}

/** What `moved` costs at `rate` times the book prices, in copper; undefined when something in it has no price. */
export function tradeCost(moved: readonly InventoryEntry[], content: Content, rate: number): number | undefined {
  let gp = 0;
  for (const e of moved) {
    const price = content.items.get(e.item)?.price;
    if (price === undefined) return undefined;
    gp += price * e.qty;
  }
  return Math.round(gp * rate * VALUE.gp);
}

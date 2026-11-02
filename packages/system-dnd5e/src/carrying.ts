import type { Content } from './content.ts';
import type { Token } from './token-schema.ts';
import { type Currency, type InventoryEntry, type Item, MAX_ATTUNED } from './stats-schema.ts';

// What a creature carries: coins, the weight of its gear against its
// carrying capacity, containers, and the three magic items it may attune to.

const COIN_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 } as const;
const COINS_PER_POUND = 50;

const coinsOf = (c: Currency | undefined) => Object.entries(c ?? {}) as [keyof typeof COIN_CP, number | undefined][];

/** Fifty coins of any kind weigh a pound. */
export function coinWeight(currency: Currency | undefined): number {
  return coinsOf(currency).reduce((n, [, count]) => n + (count ?? 0), 0) / COINS_PER_POUND;
}

/** What the coins are worth in gold pieces. */
export function totalGp(currency: Currency | undefined): number {
  return coinsOf(currency).reduce((n, [kind, count]) => n + (count ?? 0) * COIN_CP[kind], 0) / COIN_CP.gp;
}

/** Strength × 15 pounds, doubled per size above medium (2 squares = large) and halved for tiny. */
export function carryingCapacity(strength: number, size: number): number {
  const times = size < 1 ? 0.5 : 2 ** (Math.round(size) - 1);
  return strength * 15 * times;
}

const round = (n: number) => Math.round(n * 100) / 100;

const entryWeight = (e: InventoryEntry, content: Content) => (content.items.get(e.item)?.weight ?? 0) * e.qty;

/** The container item an entry with id `id` holds things in, if it is one. */
function containerOf(list: readonly InventoryEntry[], id: string, content: Content): Item | undefined {
  const entry = list.find((e) => e.id === id);
  const item = entry && content.items.get(entry.item);
  return item?.type === 'gear' && item.container ? item : undefined;
}

/** Pounds inside the container entry `id`. */
export function containerLoad(token: Pick<Token, 'inventory'>, id: string, content: Content): number {
  const list = token.inventory ?? [];
  return round(list.filter((e) => e.in === id).reduce((n, e) => n + entryWeight(e, content), 0));
}

/** Everything carried, in pounds: gear, coins, but not what's inside a bag of holding. */
export function carriedWeight(token: Pick<Token, 'inventory' | 'currency'>, content: Content): number {
  const list = token.inventory ?? [];
  const weightless = (e: InventoryEntry) => {
    const box = e.in ? containerOf(list, e.in, content) : undefined;
    return box?.type === 'gear' && box.container?.weightless === true;
  };
  const gear = list.filter((e) => !weightless(e)).reduce((n, e) => n + entryWeight(e, content), 0);
  return round(gear + coinWeight(token.currency));
}

export interface Encumbrance {
  weight: number;
  capacity: number;
  /** Carrying more than its capacity: speed drops to 5 ft. */
  over: boolean;
}

/** What `token` carries against what a creature of its Strength and size can. */
export function encumbrance(
  token: Pick<Token, 'inventory' | 'currency' | 'size'>,
  strength: number,
  content: Content,
): Encumbrance {
  const weight = carriedWeight(token, content);
  const capacity = carryingCapacity(strength, token.size);
  return { weight, capacity, over: weight > capacity };
}

/** How many magic items the creature is attuned to. */
export function attunedCount(token: Pick<Token, 'inventory'>): number {
  return (token.inventory ?? []).filter((e) => e.attuned).length;
}

/** Why the creature can't attune to the entry at `index`, or undefined if it can. */
export function attuneProblem(token: Pick<Token, 'inventory'>, index: number, content: Content): string | undefined {
  const entry = token.inventory?.[index];
  const item = entry && content.items.get(entry.item);
  if (!entry || !item?.attunement) return `${item?.name ?? 'That'} doesn't need attunement`;
  if (!entry.attuned && attunedCount(token) >= MAX_ATTUNED) return 'Already attuned to three items';
  return undefined;
}

/** An item works while equipped, and attuned if it needs that. */
export function itemWorks(entry: InventoryEntry, item: Item | undefined): boolean {
  return !!item && entry.equipped && (!item.attunement || entry.attuned === true);
}

/** A free entry id for `item`: the item's id, numbered if taken. */
function freshId(list: readonly InventoryEntry[], item: string): string {
  const taken = new Set(list.map((e) => e.id));
  if (!taken.has(item)) return item;
  let n = 2;
  while (taken.has(`${item}-${n}`)) n++;
  return `${item}-${n}`;
}

/** Why the entry at `index` can't go into the entry at `box`, or undefined if it can. */
export function stowProblem(
  list: readonly InventoryEntry[],
  index: number,
  box: number,
  content: Content,
): string | undefined {
  const target = list[box];
  const item = target && content.items.get(target.item);
  if (!list[index] || !target) return 'No such item';
  if (index === box || item?.type !== 'gear' || !item.container) return `${item?.name ?? 'That'} is not a container`;
  if (target.in) return "Containers don't go inside containers here";
  return undefined;
}

/** Moves the entry at `index` into the container entry at `box` (undefined: out of any). */
export function putInside(list: readonly InventoryEntry[], index: number, box: number | undefined): InventoryEntry[] {
  const target = box === undefined ? undefined : list[box];
  const boxId = target && (target.id ?? freshId(list, target.item));
  return list.map((e, i) => {
    if (i === box) return { ...e, id: boxId };
    if (i !== index) return e;
    const { in: _out, ...rest } = e;
    return boxId ? { ...rest, in: boxId } : rest;
  });
}

/** The list without the entry at `index`; what was inside it is tipped out loose. */
export function dropEntry(list: readonly InventoryEntry[], index: number): InventoryEntry[] {
  const box = list[index]?.id;
  return list
    .filter((_, i) => i !== index)
    .map((e) => {
      if (!box || e.in !== box) return e;
      const { in: _out, ...rest } = e;
      return rest;
    });
}

/** Entries in a container it doesn't carry, and overfull containers (for check-game). */
export function inventoryIssues(token: Pick<Token, 'inventory'>, content: Content): string[] {
  const list = token.inventory ?? [];
  const lost = list
    .filter((e) => e.in && !containerOf(list, e.in, content))
    .map((e) => `item "${e.item}" is in "${e.in}", which is not a container it carries`);
  const full = list.flatMap((e) => {
    const box = e.id ? containerOf(list, e.id, content) : undefined;
    const capacity = box?.type === 'gear' ? (box.container?.capacity ?? 0) : 0;
    const load = e.id ? containerLoad(token, e.id, content) : 0;
    return box && load > capacity ? [`container "${e.id}" holds ${load} lb, more than its ${capacity} lb`] : [];
  });
  return [...lost, ...full];
}

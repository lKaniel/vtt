import { type ClientMessage, type Content, type InventoryEntry, tradeCost, type TokenView } from '@vtt/system-dnd5e';

// The pile window's model (ui/PileWindow.tsx): what a pile of loot or a
// merchant holds, what it costs, and the trades the window asks the server
// for (system-dnd5e piles.ts, the server's pile-actions.ts).

export interface PileRow {
  /** The entry's index in the pile's inventory. */
  index: number;
  name: string;
  qty: number;
  /** What one costs at the merchant's rate; missing for loot and for what has no price. */
  price?: string;
  /** The names of what is packed in it. */
  inside: string[];
}

/** The entries inside the container entry `id`, nested ones too. */
function packed(list: readonly InventoryEntry[], id: string | undefined): InventoryEntry[] {
  if (!id) return [];
  return list.filter((e) => e.in === id).flatMap((e) => [e, ...packed(list, e.id)]);
}

/** The loose gear in a pile (or a creature's bag) with its contents; priced at `rate` times the book when given. */
export function pileRows(token: Pick<TokenView, 'inventory'>, rate: number | undefined, content: Content): PileRow[] {
  const list = token.inventory ?? [];
  const name = (e: InventoryEntry) => content.items.get(e.item)?.name ?? e.item;
  return list.flatMap((entry, index) => {
    if (entry.in) return [];
    const inside = packed(list, entry.id);
    const cp = rate === undefined ? undefined : tradeCost([{ ...entry, qty: 1 }, ...inside], content, rate);
    const price = cp === undefined ? {} : { price: coinText(cp) };
    return [{ index, name: name(entry), qty: entry.qty, ...price, inside: inside.map(name) }];
  });
}

const COIN_STEPS = [
  ['gp', 100],
  ['sp', 10],
  ['cp', 1],
] as const;

/** Copper as gold, silver and copper: "1 gp 5 sp". */
export function coinText(cp: number): string {
  let left = Math.round(cp);
  const parts: string[] = [];
  for (const [kind, value] of COIN_STEPS) {
    const n = Math.floor(left / value);
    left -= n * value;
    if (n) parts.push(`${n} ${kind}`);
  }
  return parts.join(' ') || 'free';
}

interface Seat {
  selected?: string;
  tokens: ReadonlyMap<string, TokenView>;
  canControl(token: TokenView): boolean;
}

/** The creature that trades at a pile: the selected one you control, else the first of yours. */
export function pileTrader(s: Seat): TokenView | undefined {
  const yours = (t: TokenView | undefined): t is TokenView => !!t && !t.pile && s.canControl(t);
  const selected = s.selected ? s.tokens.get(s.selected) : undefined;
  return yours(selected) ? selected : [...s.tokens.values()].find(yours);
}

/** Take (or buy) entry `item` of the pile for `trader`, or put (or sell) the trader's entry `item` in it. */
export function tradeMessage(
  how: 'take' | 'put',
  { pile, trader }: { pile: string; trader: string },
  item: number,
  qty?: number,
): ClientMessage {
  const [from, to] = how === 'take' ? [pile, trader] : [trader, pile];
  return { t: 'trade', from, to, item, ...(qty !== undefined && { qty }) };
}

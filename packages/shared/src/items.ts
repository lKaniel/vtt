import { srdFor } from './content.ts';
import { roll, type Rng } from './dice.ts';
import type { Creature } from './creature.ts';
import type { Token } from './schema.ts';
import type { Edition, Item } from './stats-schema.ts';

// Using what a creature carries: drinking potions and the like.

/** What using `item` costs: a potion is an action in 2014 and a bonus action in 2024. */
export function itemCost(item: Item, edition: Edition): 'action' | 'bonus' {
  return item.type === 'gear' && item.use?.potion && edition === '2024' ? 'bonus' : 'action';
}

/** Why `token` can't use `item` now, or undefined if it can. */
export function itemProblem(token: Token, item: Item | undefined): string | undefined {
  if (!item || !token.inventory?.some((e) => e.item === item.id)) return "doesn't carry that";
  if (item.type !== 'gear' || !item.use) return `${item.name} can't be used like that`;
  return undefined;
}

export interface ItemUse {
  token: Token;
  healed?: number;
}

/** One fewer of `id`; the entry goes once the last one is used. */
function consume(token: Token, id: string): Token {
  const inventory = token.inventory ?? [];
  const at = inventory.findIndex((e) => e.item === id);
  const entry = inventory[at]!;
  const rest = inventory.filter((_, i) => i !== at);
  if (entry.qty <= 1) return { ...token, inventory: rest };
  return { ...token, inventory: inventory.map((e, i) => (i === at ? { ...e, qty: e.qty - 1 } : e)) };
}

/** Uses up one of the item `id` and applies what it does. Check `itemProblem` first. */
export function useItem(token: Token, sheet: Creature, id: string, rng: Rng = Math.random): ItemUse {
  const item = srdFor('2014').items.get(id);
  const next = consume(token, id);
  const heal = item?.type === 'gear' ? item.use?.heal : undefined;
  if (!heal) return { token: next };
  const hp = Math.min(sheet.maxHp, sheet.hp + Math.max(0, roll(heal, rng).total));
  return { token: { ...next, hp: hp >= sheet.maxHp ? undefined : hp }, healed: hp - sheet.hp };
}

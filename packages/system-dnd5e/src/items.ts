import { type Rng, roll } from '@vtt/shared';
import type { Creature } from './creature.ts';
import type { Token } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';
import type { GearUse, Item } from './item-schema.ts';

// Using what a creature carries: drinking potions, lighting torches and
// lanterns (the light burns out by world time, see durations.ts).

/** What using `item` costs: a potion is an action in 2014 and a bonus action in 2024. */
export function itemCost(item: Item, edition: Edition): 'action' | 'bonus' {
  return item.type === 'gear' && item.use?.potion && edition === '2024' ? 'bonus' : 'action';
}

const carries = (token: Token, id: string) => !!token.inventory?.some((e) => e.item === id);

/** Why `token` can't use `item` now, or undefined if it can. `items`: the game's content, which names the fuel. */
export function itemProblem(
  token: Token,
  item: Item | undefined,
  items: ReadonlyMap<string, Item>,
): string | undefined {
  if (!item || !carries(token, item.id)) return "doesn't carry that";
  if (item.type !== 'gear' || !item.use) return `${item.name} can't be used like that`;
  const fuel = item.use.fuel;
  if (fuel && !carries(token, fuel)) return `has no ${items.get(fuel)?.name ?? fuel} for the ${item.name}`;
  return undefined;
}

export interface ItemUse {
  token: Token;
  healed?: number;
  /** The light it lit, by name. */
  lit?: string;
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

/** Uses up one of `item` (as the game's content has it) and applies what it does. Check `itemProblem` first. */
export function useItem(token: Token, sheet: Creature, item: Item, rng: Rng = Math.random): ItemUse {
  const use = item.type === 'gear' ? item.use : undefined;
  const next = consume(token, use?.fuel ?? item.id);
  if (use?.light) {
    const { endsAt: _endsAt, ...light } = use.light;
    const name = light.name ?? item.name;
    return { token: { ...next, light: { ...light, name } }, lit: name };
  }
  if (!use) return { token: next };
  const healed = healing(next, sheet, use, rng);
  return { ...healed, token: raised(withEffect(withTempHp(healed.token, use, rng), item), use) };
}

function healing(token: Token, sheet: Creature, use: GearUse, rng: Rng): ItemUse {
  if (!use.heal) return { token };
  const hp = Math.min(sheet.maxHp, sheet.hp + Math.max(0, roll(use.heal, rng).total));
  return { token: { ...token, hp: hp >= sheet.maxHp ? undefined : hp }, healed: hp - sheet.hp };
}

/** Temporary hit points don't add up: the better of the two is kept. */
function withTempHp(token: Token, use: GearUse, rng: Rng): Token {
  if (use.tempHp === undefined) return token;
  const gained = typeof use.tempHp === 'number' ? use.tempHp : Math.max(0, roll(use.tempHp, rng).total);
  return { ...token, tempHp: Math.max(token.tempHp ?? 0, gained) };
}

/** The item's effect on the user (a potion's); drinking another of the same starts it over. */
function withEffect(token: Token, item: Item): Token {
  const template = item.type === 'gear' ? item.use?.effect : undefined;
  if (!template) return token;
  const id = `item-${item.id}`;
  const effect = { ...template, id, name: template.name ?? item.name, source: token.id };
  return { ...token, effects: [...(token.effects ?? []).filter((e) => e.id !== id), effect] };
}

/** A manual or tome: the score goes up for good, to 30 at most. */
function raised(token: Token, use: GearUse): Token {
  if (!use.raise || !token.stats) return token;
  const { ability, by } = use.raise;
  const abilities = {
    ...token.stats.abilities,
    [ability]: Math.min(30, (token.stats.abilities?.[ability] ?? 10) + by),
  };
  return { ...token, stats: { ...token.stats, abilities } };
}

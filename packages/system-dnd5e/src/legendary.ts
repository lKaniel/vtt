import type { Combat } from './combat.ts';
import { currentTurn } from './combat.ts';
import type { SaveRoll } from './effects.ts';
import type { Monster } from './monster-schema.ts';
import type { Lair, Legendary } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// Legendary creatures: a pool of legendary actions spent at the end of other
// creatures' turns, legendary resistance that turns failed saves into
// successes, and lair actions on initiative count 20.

const POOL = 'legendary';
const RESIST = 'legendary-resistance';
const LAIR = 'lair:';
/** The key of a once-a-round option taken this round. */
const TAKEN = 'legendary:';

export interface LegendarySheet extends Legendary {
  /** Actions left until the start of its next turn. */
  left: number;
  /** Once-a-round options taken since then. */
  taken?: string[];
}

export interface LegendaryParts {
  legendary?: LegendarySheet;
  legendaryResistance?: { total: number; left: number };
  lair?: Lair;
}

/** The once-a-round options the creature took since its turn began. */
function taken(token: Pick<Token, 'spent'>): { taken?: string[] } {
  const ids = Object.keys(token.spent?.uses ?? {}).flatMap((k) => (k.startsWith(TAKEN) ? [k.slice(TAKEN.length)] : []));
  return ids.length ? { taken: ids } : {};
}

/** The creature's legendary actions, resistance and lair: its own stats first, else its stat block. */
export function legendaryParts(token: Pick<Token, 'stats' | 'spent'>, monster?: Monster): LegendaryParts {
  const stats = token.stats ?? {};
  const legendary = stats.legendary ?? monster?.legendary;
  const resist = stats.legendaryResistance ?? monster?.legendaryResistance;
  const lair = stats.lair ?? monster?.lair;
  const used = (key: string) => token.spent?.uses?.[key] ?? 0;
  return {
    ...(legendary && {
      legendary: { ...legendary, left: Math.max(0, legendary.actions - used(POOL)), ...taken(token) },
    }),
    ...(resist && { legendaryResistance: { total: resist, left: Math.max(0, resist - used(RESIST)) } }),
    ...(lair && { lair }),
  };
}

/** Why `token` can't take the legendary action `option` now, or undefined if it can. */
export function legendaryProblem(
  token: Pick<Token, 'id' | 'name'>,
  sheet: LegendaryParts,
  combat: Combat | undefined,
  option: string,
): string | undefined {
  const legendary = sheet.legendary;
  if (!legendary) return `${token.name} has no legendary actions`;
  const chosen = legendary.options.find((o) => o.id === option);
  if (!chosen) return `${token.name} has no such legendary action`;
  if (!combat || combat.peaceful) return 'Legendary actions are taken in a fight';
  if (currentTurn(combat) === token.id) return `${token.name} can't take legendary actions on its own turn`;
  if (chosen.cost > legendary.left) return `${token.name} has no legendary actions left for ${chosen.name}`;
  if (chosen.oncePerRound && legendary.taken?.includes(chosen.id))
    return `${token.name} can't take ${chosen.name} again until the start of its next turn`;
  return undefined;
}

const spendUse = (token: Token, key: string, n: number): Token => ({
  ...token,
  spent: { ...token.spent, uses: { ...token.spent?.uses, [key]: (token.spent?.uses?.[key] ?? 0) + n } },
});

/** `cost` legendary actions spent, on `option` when it is taken once a round. */
export function spendLegendary(token: Token, cost: number, option?: string): Token {
  const spent = spendUse(token, POOL, cost);
  return option ? spendUse(spent, `${TAKEN}${option}`, 1) : spent;
}

/** One legendary resistance used. */
export function spendResistance(token: Token): Token {
  return spendUse(token, RESIST, 1);
}

/** The pool comes back at the start of the creature's turn. */
export function refreshLegendary(token: Token): Token {
  const all = token.spent?.uses ?? {};
  const kept = Object.entries(all).filter(([k]) => k !== POOL && !k.startsWith(TAKEN));
  if (kept.length === Object.keys(all).length) return token;
  const uses = Object.fromEntries(kept);
  const spent = { ...token.spent, uses: kept.length ? uses : undefined };
  return { ...token, spent: spent.uses || spent.slots || spent.hitDice ? spent : undefined };
}

/** Legendary resistance kept through a short rest (it comes back on a long one). */
export function keptResistance(token: Pick<Token, 'spent'>): Record<string, number> {
  const used = token.spent?.uses?.[RESIST];
  return used ? { [RESIST]: used } : {};
}

/** A failed save the creature turns into a success with legendary resistance, if it has any left. */
export function resistSave(sheet: LegendaryParts, save: SaveRoll): SaveRoll {
  if (save.success || !sheet.legendaryResistance?.left) return save;
  return { ...save, success: true, legendary: true };
}

/** The fight with a lair turn for each of `owners` on initiative 20, after creatures that rolled 20 or more. */
export function withLair(combat: Combat, owners: readonly string[]): Combat {
  if (!owners.length) return combat;
  const at = combat.order.findIndex((e) => e.initiative < 20);
  const cut = at < 0 ? combat.order.length : at;
  const lairs = owners.map((id) => ({ token: `${LAIR}${id}`, initiative: 20 }));
  return { ...combat, order: [...combat.order.slice(0, cut), ...lairs, ...combat.order.slice(cut)] };
}

export const isLairTurn = (entry: string | undefined): boolean => !!entry?.startsWith(LAIR);

/** The creature whose lair takes the turn `entry`. */
export const lairOwner = (entry: string): string => entry.slice(LAIR.length);

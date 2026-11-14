import { cpOf, pay } from './piles.ts';
import { COINS, type Coin, type Currency } from './stats-schema.ts';

// Paying and taking coins on the sheet: an amount in mixed coins is paid
// small coins first with change given back, and the purse is then tidied,
// ten copper to a silver and ten silver to a gold. Electrum and platinum are
// kept as they are; they are broken only when nothing smaller pays.

/** Small change gathered upward: copper into silver, silver into gold. */
const GATHER: readonly [Coin, Coin][] = [
  ['cp', 'sp'],
  ['sp', 'gp'],
];

/** The purse with small change gathered into bigger coins and zero counts dropped. */
export function rebalance(currency: Currency | undefined): Currency {
  const out: Currency = { ...currency };
  for (const [small, big] of GATHER) {
    const n = out[small] ?? 0;
    out[big] = (out[big] ?? 0) + Math.floor(n / 10);
    out[small] = n % 10;
  }
  return Object.fromEntries(COINS.flatMap((c) => (out[c] ? [[c, out[c]]] : [])));
}

/** The purse after paying `amount`, or undefined when it holds too little. */
export function payCoins(currency: Currency | undefined, amount: Currency): Currency | undefined {
  const left = pay(currency, cpOf(amount));
  return left && rebalance(left);
}

/** The purse with `amount` added. */
export function gainCoins(currency: Currency | undefined, amount: Currency): Currency {
  const out: Currency = { ...currency };
  for (const c of COINS) out[c] = (out[c] ?? 0) + (amount[c] ?? 0);
  return rebalance(out);
}

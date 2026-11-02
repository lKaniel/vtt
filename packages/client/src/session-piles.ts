import type { Currency, TokenView } from '@vtt/system-dnd5e';
import { ActionSession } from './session-actions.ts';
import { pileTrader, tradeMessage } from './pile-view.ts';

// Item piles (system-dnd5e piles.ts): the pile whose window is open, and the
// trades its buttons send for the creature you act with.

export abstract class PileSession extends ActionSession {
  /** The pile of loot or merchant whose window is open. */
  pile?: string;

  abstract canControl(token: TokenView): boolean;

  /** Opens a pile's window (nothing for a token that isn't one), or closes it. */
  openPile(id: string | undefined): void {
    this.pile = id && this.tokens.get(id)?.pile ? id : undefined;
    this.changed();
  }

  /** The creature that trades at the open pile. */
  get trader(): TokenView | undefined {
    return pileTrader(this);
  }

  /** Takes (buys) the pile's entry `item`, or puts (sells) the trader's entry `item` in it. */
  trade(how: 'take' | 'put', item: number, qty?: number): void {
    const trader = this.trader;
    if (this.pile && trader) this.send(tradeMessage(how, { pile: this.pile, trader: trader.id }, item, qty));
  }

  /** Takes coins from the open pile. */
  takeCoins(coins: Currency): void {
    const trader = this.trader;
    if (this.pile && trader) this.send({ t: 'trade', from: this.pile, to: trader.id, coins });
  }

  /** The open pile is gone: close its window. */
  protected pileGone(id: string): void {
    if (this.pile === id) this.pile = undefined;
  }
}

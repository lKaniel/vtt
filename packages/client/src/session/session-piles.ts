import type { SessionPart } from './session-part.ts';
import type { ClientMessage, Currency, TokenView } from '@vtt/system-dnd5e';
import { pileTrader, tradeMessage } from '../text/pile-view.ts';

// Item piles (system-dnd5e piles.ts): the pile whose window is open, and the
// trades its buttons send for the creature you act with. Reached as
// `session.piles`.

/** What the piles need of the session: the tokens, your selection and seat, and a way to the server. */
export interface PileHost {
  readonly tokens: ReadonlyMap<string, TokenView>;
  readonly selected?: string;
  canControl(token: TokenView): boolean;
  send(msg: ClientMessage): void;
}

/** The pile window, as `session.piles`. */
export class Piles implements SessionPart {
  /** The pile of loot or merchant whose window is open. */
  current?: string;

  constructor(
    private readonly s: PileHost,
    private readonly on: { changed(): void },
  ) {}

  /** Opens a pile's window (nothing for a token that isn't one), or closes it. */
  open(id: string | undefined): void {
    this.current = id && this.s.tokens.get(id)?.pile ? id : undefined;
    this.on.changed();
  }

  /** The creature that trades at the open pile. */
  get trader(): TokenView | undefined {
    return pileTrader(this.s);
  }

  /** Takes (buys) the pile's entry `item`, or puts (sells) the trader's entry `item` in it. */
  trade(how: 'take' | 'put', item: number, qty?: number): void {
    const trader = this.trader;
    if (this.current && trader) this.s.send(tradeMessage(how, { pile: this.current, trader: trader.id }, item, qty));
  }

  /** Takes coins from the open pile. */
  takeCoins(coins: Currency): void {
    const trader = this.trader;
    if (this.current && trader) this.s.send({ t: 'trade', from: this.current, to: trader.id, coins });
  }

  /** A token is gone: close its window if it was the open pile. */
  gone(id: string): void {
    if (this.current === id) this.current = undefined;
  }
}

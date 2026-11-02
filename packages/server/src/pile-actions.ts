import {
  type Currency,
  cpOf,
  earn,
  type InventoryEntry,
  moveCoins,
  pay,
  putIn,
  takeOut,
  type Token,
  tokenDistance,
  TokenSchema,
  tradeCost,
} from '@vtt/system-dnd5e';
import { canControl, isGm, isGridless, type Player, uniqueId } from '@vtt/shared';
import type { ClientMessage } from './client-messages.ts';
import { contentFor } from './game-packs.ts';
import { Refusal, type Table } from './table.ts';

type Trade = Extract<ClientMessage, { t: 'trade' }>;

/** Feet a creature stands from a pile without one of its own: next to it. */
const NEXT_TO = 5;

/** "2 × Dagger", "Dagger". */
const counted = (qty: number, name: string) => (qty > 1 ? `${qty} × ${name}` : name);
const gpText = (cp: number) => `${Math.round(cp) / 100} gp`;
const coinsText = (coins: Currency) =>
  Object.entries(coins)
    .filter(([, n]) => n)
    .map(([kind, n]) => `${n} ${kind}`)
    .join(', ');

/**
 * Item piles (see system-dnd5e piles.ts): taking from loot and putting gear
 * in it, buying from merchants and selling to them, and dropping gear on the
 * ground as a new pile. Players trade for the creatures they control, within
 * the pile's reach; the GM may move anything anywhere.
 */
export class Piles {
  constructor(private table: Table) {}

  private get store() {
    return this.table.store;
  }

  trade(player: Player, canSee: (id: string) => boolean, msg: Trade): void {
    const from = this.token(msg.from);
    const to = msg.to === undefined ? this.groundFor(player, from) : this.token(msg.to);
    const mine = from.pile ? to : from;
    if (!isGm(player) && msg.to !== undefined) this.allowed(player, canSee, mine, mine === from ? to : from);
    if (msg.coins) this.coins(from, to, msg.coins);
    else this.goods(from, to, msg.item ?? 0, msg.qty);
    this.tidy(from.id);
  }

  private token(id: string): Token {
    const token = this.store.tokens.get(id);
    if (!token) throw new Refusal('No such token');
    return token;
  }

  private allowed(player: Player, canSee: (id: string) => boolean, mine: Token, other: Token): void {
    if (!canControl(mine, player)) throw new Refusal(`You don't control ${mine.name}`);
    if (other.id !== mine.id && !canSee(other.id)) throw new Refusal('No such token');
    if (other.pile?.locked) throw new Refusal(`${other.name} is locked`);
    const world = this.store.world;
    const feet = tokenDistance(mine, other, world.gridSize, isGridless(world));
    if (feet > (other.pile?.reach ?? NEXT_TO)) throw new Refusal(`${mine.name} is too far from ${other.name}`);
  }

  /** The loot pile under a creature dropping something, or a new one there (made when something lands in it). */
  private groundFor(player: Player, token: Token): Token {
    if (!canControl(token, player)) throw new Refusal(`You don't control ${token.name}`);
    const half = this.store.world.gridSize / 2;
    const under = [...this.store.tokens.values()].find(
      (t) => t.pile?.kind === 'loot' && !t.pile.locked && Math.hypot(t.x - token.x, t.y - token.y) < half,
    );
    if (under) return under;
    const tokens = this.store.tokens;
    return TokenSchema.parse({
      id: uniqueId('loot', (id) => tokens.has(id)),
      name: 'Loot',
      x: token.x,
      y: token.y,
      elevation: token.elevation,
      size: 0.5,
      color: '#8a6a3a',
      speed: 0,
      pile: {},
    });
  }

  private coins(from: Token, to: Token, coins: Currency): void {
    const merchant = [from, to].find((t) => t.pile?.kind === 'merchant');
    if (merchant) throw new Refusal(`${merchant.name} trades in goods, not coins`);
    const out = moveCoins(from.currency, to.currency, coins);
    if ('problem' in out) throw new Refusal(out.problem);
    this.store.setToken({ ...from, currency: out.from });
    this.store.setToken({ ...to, currency: out.to });
    this.table.note(this.line(from, to, coinsText(coins)));
  }

  private goods(from: Token, to: Token, index: number, qty?: number): void {
    const out = takeOut(from.inventory ?? [], index, qty ?? defaultQty(from, index));
    if ('problem' in out) throw new Refusal(out.problem);
    const [top] = out.moved;
    const what = counted(top!.qty, this.itemName(from, top!));
    const price = this.price(from, to, out.moved, what);
    const left = from.pile?.infinite ? from.inventory : out.rest;
    this.store.setToken({ ...from, inventory: left?.length ? left : undefined, ...price.from });
    this.store.setToken({ ...to, inventory: putIn(to.inventory ?? [], out.moved), ...price.to });
    this.table.note(this.line(from, to, what, price.cp));
  }

  /** The purses after a sale or a purchase; nothing changes hands for loot. */
  private price(from: Token, to: Token, moved: InventoryEntry[], what: string): Prices {
    if (from.pile?.kind === 'merchant') {
      const cp = tradeCost(moved, contentFor(this.store, from), from.pile.buy);
      if (cp === undefined) throw new Refusal(`${what} isn't for sale`);
      const purse = pay(to.currency, cp);
      if (!purse) throw new Refusal(`${to.name} can't pay ${gpText(cp)} for ${what}`);
      return { cp, to: { currency: purse } };
    }
    if (to.pile?.kind === 'merchant') {
      const cp = tradeCost(moved, contentFor(this.store, to), to.pile.sell);
      if (cp === undefined) throw new Refusal(`${to.name} won't buy ${what}`);
      return { cp, from: { currency: earn(from.currency, cp) } };
    }
    return {};
  }

  /** What the chat says about a trade. */
  private line(from: Token, to: Token, what: string, cp?: number): string {
    const paid = cp === undefined ? '' : ` for ${gpText(cp)}`;
    if (from.pile?.kind === 'merchant') return `${to.name} buys ${what} from ${from.name}${paid}`;
    if (to.pile?.kind === 'merchant') return `${from.name} sells ${what} to ${to.name}${paid}`;
    if (from.pile) return `${to.name} takes ${what} from ${from.name}`;
    if (to.pile && to.name === 'Loot') return `${from.name} drops ${what}`;
    return `${from.name} puts ${what} in ${to.name}`;
  }

  private itemName(token: Token, entry: InventoryEntry): string {
    return contentFor(this.store, token).items.get(entry.item)?.name ?? entry.item;
  }

  /** An emptied loot pile goes, unless it is kept. */
  private tidy(id: string): void {
    const pile = this.store.tokens.get(id);
    if (pile?.pile?.kind !== 'loot' || pile.pile.keepEmpty) return;
    if (!pile.inventory?.length && cpOf(pile.currency) === 0) this.table.removeToken(id);
  }
}

/** A merchant sells one at a time unless asked for more; everything else moves as a stack. */
function defaultQty(from: Token, index: number): number {
  return from.pile?.kind === 'merchant' ? 1 : (from.inventory?.[index]?.qty ?? 1);
}

interface Prices {
  cp?: number;
  from?: { currency: Currency };
  to?: { currency: Currency };
}

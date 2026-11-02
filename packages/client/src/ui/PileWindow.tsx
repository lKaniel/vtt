import { cpOf, type Pile, type TokenView, toEdition, withOwn } from '@vtt/system-dnd5e';
import { purseText } from '../carried.ts';
import { gameContent } from '../content.ts';
import { type PileRow, pileRows } from '../pile-view.ts';
import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './kit/dialog.tsx';

// A pile of loot's or a merchant's window, like the Item Piles module's:
// what it holds with a Take (Buy) button each, its coins, and the trader's
// own gear to put in (or sell). The server checks reach and prices.

export function PileWindow({ session }: Readonly<{ session: Session }>) {
  const pile = session.pile ? session.tokens.get(session.pile) : undefined;
  if (!pile?.pile) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && session.openPile(undefined)}>
      <DialogContent data-slot="pile-window" className="w-[min(560px,calc(100vw-32px))]">
        <DialogTitle>{pile.name}</DialogTitle>
        <DialogDescription>{describe(pile.pile)}</DialogDescription>
        {pile.pile.locked && !session.isGm() ? (
          <p className="muted">It is locked.</p>
        ) : (
          <Contents session={session} pile={pile} kind={pile.pile} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function describe(pile: Pile): string {
  if (pile.kind === 'loot') return pile.locked ? 'Loot (locked)' : 'Loot: take what you like.';
  return `Merchant: sells at ×${pile.buy} the book price, buys at ×${pile.sell}.`;
}

interface ContentsProps {
  session: Session;
  pile: TokenView;
  kind: Pile;
}

function Contents({ session, pile, kind }: Readonly<ContentsProps>) {
  const trader = session.trader;
  const rules = toEdition(session.world?.rules);
  const merchant = kind.kind === 'merchant';
  const goods = pileRows(pile, merchant ? kind.buy : undefined, withOwn(gameContent(rules), pile));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {trader ? `Trading as ${trader.name}.` : 'Select a creature of yours to trade with.'}
      </p>
      <Rows
        rows={goods}
        empty={merchant ? 'Sold out.' : 'Nothing left.'}
        action={merchant ? 'Buy' : 'Take'}
        priced={merchant}
        onRow={trader && ((row) => session.trade('take', row.index, merchant ? 1 : undefined))}
      />
      {!merchant && cpOf(pile.currency) > 0 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">{purseText(pile.currency)}</span>
          <Button variant="outline" size="sm" disabled={!trader} onClick={() => session.takeCoins(pile.currency ?? {})}>
            Take coins
          </Button>
        </div>
      )}
      {trader && <Yours session={session} trader={trader} kind={kind} />}
    </div>
  );
}

/** The trader's own gear, to put in the pile or sell to the merchant. */
function Yours({ session, trader, kind }: Readonly<{ session: Session; trader: TokenView; kind: Pile }>) {
  const merchant = kind.kind === 'merchant';
  const rules = toEdition(trader.stats?.rules ?? session.world?.rules);
  const rows = pileRows(trader, merchant ? kind.sell : undefined, withOwn(gameContent(rules), trader));
  return (
    <>
      <h4>{trader.name}’s gear</h4>
      <Rows
        rows={rows}
        empty="Empty-handed."
        action={merchant ? 'Sell' : 'Put in'}
        priced={merchant}
        onRow={(row) => session.trade('put', row.index, merchant ? 1 : undefined)}
      />
    </>
  );
}

interface RowsProps {
  rows: PileRow[];
  empty: string;
  action: string;
  onRow?: (row: PileRow) => void;
  /** A merchant only trades what has a price. */
  priced?: boolean;
}

function Rows({ rows, empty, action, onRow, priced }: Readonly<RowsProps>) {
  if (!rows.length) return <p className="muted text-sm">{empty}</p>;
  return (
    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
      {rows.map((row) => (
        <li key={row.index} className="flex items-center gap-2 text-sm">
          <span className="flex-1">
            {row.qty > 1 ? `${row.qty} × ${row.name}` : row.name}
            {row.inside.length > 0 && <span className="text-muted-foreground"> (with {row.inside.join(', ')})</span>}
          </span>
          {row.price && <span className="text-muted-foreground">{row.price}</span>}
          <Button variant="outline" size="sm" disabled={!onRow || (priced && !row.price)} onClick={() => onRow?.(row)}>
            {action}
          </Button>
        </li>
      ))}
    </ul>
  );
}

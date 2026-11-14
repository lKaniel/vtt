import { useState } from 'react';
import { type Coin, COINS, type Currency } from '@vtt/system-dnd5e';
import { MinusIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { t } from '../../i18n/index.ts';
import { purseAfter, type PurseMove, purseText, worthText } from '../../play/carried.ts';
import { cn } from '@/lib/utils';
import { canCarry } from './CarryParts.tsx';
import type { SheetProps } from './sheet-props.ts';
import { Button } from '../kit/button.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../kit/popover.tsx';

// The coins, at the top of the Inventory tab: what the purse holds and
// buttons to pay or add an amount in mixed coins. Paying makes change from
// bigger coins and adding gathers small change upward (`purse.ts`), so
// nobody counts coppers by hand. "Set" counts the purse exactly.

const COIN_LOOK: Record<Coin, string> = {
  pp: 'bg-[radial-gradient(circle_at_35%_35%,#f4f6fb,#9aa3b5)]',
  gp: 'bg-[radial-gradient(circle_at_35%_35%,#ffe28a,#b07d12)]',
  ep: 'bg-[radial-gradient(circle_at_35%_35%,#f0ecb8,#9c9450)]',
  sp: 'bg-[radial-gradient(circle_at_35%_35%,#eef0f3,#858b96)]',
  cp: 'bg-[radial-gradient(circle_at_35%_35%,#f0a872,#8a4a1f)]',
};

/** Gold, silver and copper always show; platinum and electrum only when held. */
const shown = (purse: Currency) => COINS.filter((c) => c === 'gp' || c === 'sp' || c === 'cp' || (purse[c] ?? 0) > 0);

function CoinDot({ coin }: Readonly<{ coin: Coin }>) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-3.5 shrink-0 rounded-full shadow-[0_1px_2px_#000]', COIN_LOOK[coin])}
    />
  );
}

function CoinCount({ coin, n }: Readonly<{ coin: Coin; n: number }>) {
  return (
    <li className={cn('flex items-center gap-1.5', !n && 'opacity-50')} title={t(`purse.coin.${coin}`)}>
      <CoinDot coin={coin} />
      <span className="font-body text-lg font-semibold leading-none lining-nums tabular-nums text-gold-bright">
        {n}
      </span>
      <span className="font-display text-xs uppercase text-gold">{coin}</span>
    </li>
  );
}

/** One field per coin kind. */
function CoinFields({ currency, onChange }: Readonly<{ currency: Currency; onChange: (c: Currency) => void }>) {
  const set = (coin: Coin, n: number) => onChange({ ...currency, [coin]: n || undefined });
  return (
    <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-2 gap-y-1">
      {COINS.map((coin) => (
        <label key={coin} className="contents">
          <CoinDot coin={coin} />
          <span className="font-display text-xs uppercase text-gold">{coin}</span>
          <NumberField
            value={currency[coin] ?? 0}
            min={0}
            onValueChange={(n) => set(coin, n)}
            aria-label={t(`purse.coin.${coin}`)}
          />
        </label>
      ))}
    </div>
  );
}

const MOVE_LOOK = {
  pay: { icon: <MinusIcon />, variant: 'default' },
  gain: { icon: <PlusIcon />, variant: 'outline' },
  set: { icon: <PencilIcon />, variant: 'ghost' },
} as const;

/** What the form says under the fields: the purse after, or why it can't. */
function Outcome({ move, after, empty }: Readonly<{ move: PurseMove; after?: Currency; empty: boolean }>) {
  if (!after) return <p className="m-0 text-sm text-destructive">{t('purse.short')}</p>;
  if (empty && move !== 'set') return <p className="m-0 text-xs text-muted-foreground">{t(`purse.hint.${move}`)}</p>;
  return <p className="m-0 text-sm">{t('purse.after', { coins: purseText(after) })}</p>;
}

interface MoveProps {
  move: PurseMove;
  purse: Currency;
  onDone: (coins: Currency) => void;
}

/** A button that opens the coin fields for one move. */
function CoinMove({ move, purse, onDone }: Readonly<MoveProps>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Currency>({});
  const after = purseAfter(move, purse, draft);
  const empty = !COINS.some((c) => draft[c]);
  const ready = !!after && (move === 'set' || !empty);
  const look = MOVE_LOOK[move];
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(move === 'set' ? purse : {});
      }}
    >
      <PopoverTrigger asChild>
        <Button variant={look.variant} size="sm">
          {look.icon}
          {t(`purse.${move}`)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <form
          aria-label={t(`purse.title.${move}`)}
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            onDone(draft);
            setOpen(false);
          }}
        >
          <h3 className="m-0 font-display text-sm text-gold-bright">{t(`purse.title.${move}`)}</h3>
          <CoinFields currency={draft} onChange={setDraft} />
          <Outcome move={move} after={after} empty={empty} />
          <Button type="submit" size="sm" disabled={!ready}>
            {t(`purse.confirm.${move}`)}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Sends a move: through the server for a creature the viewer controls, else into the sheet being edited. */
function useCoinMove(props: Readonly<SheetProps>) {
  const { session, value, update } = props;
  const live = canCarry(props);
  return (move: PurseMove, coins: Currency) => {
    if (!live) {
      update((d) => ({ ...d, currency: purseAfter(move, d.currency, coins) ?? d.currency }), false);
    } else if (move === 'set') {
      session.requests.carry(value.id, { kind: 'coins', currency: purseAfter('set', undefined, coins)! });
    } else {
      session.requests.carry(value.id, { kind: move, coins });
    }
  };
}

/** The purse at the top of the Inventory tab. */
export function PurseBar(props: Readonly<SheetProps>) {
  const { value, edit } = props;
  const send = useCoinMove(props);
  if (value.monster && !value.currency && !edit) return null;
  const purse = value.currency ?? {};
  const moves: PurseMove[] = canCarry(props) || edit ? ['pay', 'gain', 'set'] : [];
  return (
    <section
      aria-label={t('purse.label')}
      className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-gold-dim/50 bg-black/30 px-3 py-2"
    >
      <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0">
        {shown(purse).map((c) => (
          <CoinCount key={c} coin={c} n={purse[c] ?? 0} />
        ))}
      </ul>
      <span className="text-xs text-muted-foreground" title={t('purse.worthTip')}>
        ≈ {worthText(purse)}
      </span>
      {moves.length > 0 && (
        <div className="ml-auto flex items-center gap-1.5">
          {moves.map((m) => (
            <CoinMove key={m} move={m} purse={purse} onDone={(coins) => send(m, coins)} />
          ))}
        </div>
      )}
    </section>
  );
}

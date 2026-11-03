import { useState } from 'react';
import {
  type Coin,
  COINS,
  type Currency,
  encumbrance,
  type InventoryEntry,
  putInside,
  type TokenView,
} from '@vtt/system-dnd5e';
import { contentFor } from '../../content/content.ts';
import { bagLayout, loadText, loadTip, purseText } from '../../play/carried.ts';
import type { SheetProps } from './sheet-props.ts';
import { Button } from '../kit/button.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../kit/popover.tsx';
import { SelectField } from '../kit/select.tsx';

// Coins, carried weight, attunement and which container gear is packed in.

/** May the viewer pack and attune this creature's gear (a token they control)? */
export function canCarry({ session, kind, value }: Readonly<SheetProps>): boolean {
  return kind === 'token' && session.canControl(value as TokenView);
}

const contentOf = (p: Readonly<SheetProps>) => contentFor(p.value, p.sheet.edition);

/** Weight carried against capacity; characters only (monsters don't count their loot). */
export function Load(props: Readonly<SheetProps>) {
  const { value, sheet } = props;
  if (value.monster) return null;
  const load = encumbrance(value, sheet.abilities.str, contentOf(props));
  return (
    <span
      className={load.over || load.level !== 'none' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
      title={loadTip(load)}
    >
      {loadText(load)}
    </span>
  );
}

function CoinFields({ currency, onChange }: Readonly<{ currency: Currency; onChange: (c: Currency) => void }>) {
  const set = (coin: Coin, n: number) => onChange({ ...currency, [coin]: n || undefined });
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
      {COINS.map((coin) => (
        <label key={coin} className="contents">
          <span className="font-display text-xs uppercase text-gold">{coin}</span>
          <NumberField
            value={currency[coin] ?? 0}
            min={0}
            onValueChange={(n) => set(coin, n)}
            aria-label={`${coin} pieces`}
          />
        </label>
      ))}
    </div>
  );
}

/** The coins carried: edited in place by the GM, through a popover by the owner. */
export function Purse(props: Readonly<SheetProps>) {
  const { value, update, edit, session } = props;
  if (value.monster && !value.currency && !edit) return null;
  if (edit) {
    return (
      <CoinFields currency={value.currency ?? {}} onChange={(c) => update((d) => ({ ...d, currency: c }), false)} />
    );
  }
  const text = <span className="text-sm">{purseText(value.currency)}</span>;
  if (!canCarry(props)) return <div className="mb-2 flex items-center justify-between gap-2">{text}</div>;
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      {text}
      <PurseEditor
        currency={value.currency ?? {}}
        onSave={(currency) => session.requests.carry(value.id, { kind: 'coins', currency })}
      />
    </div>
  );
}

function PurseEditor({ currency, onSave }: Readonly<{ currency: Currency; onSave: (c: Currency) => void }>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(currency);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(currency);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          Coins
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <CoinFields currency={draft} onChange={setDraft} />
        <Button
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            onSave(draft);
            setOpen(false);
          }}
        >
          Save
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** The inventory with entry `index` attuned or not. */
export function attuned(list: readonly InventoryEntry[], index: number, on: boolean): InventoryEntry[] {
  return list.map((e, i) => {
    if (i !== index) return e;
    const { attuned: _was, ...rest } = e;
    return on ? { ...rest, attuned: true } : rest;
  });
}

interface InSelectProps extends SheetProps {
  index: number;
  setList: (next: InventoryEntry[], now?: boolean) => void;
}

/** Which container an entry is packed in. */
export function InSelect({ value, sheet, index, setList }: Readonly<InSelectProps>) {
  const list = value.inventory ?? [];
  const boxes = bagLayout(list, sheet.edition, value).boxes;
  // Containers don't go inside containers.
  if (!boxes.length || boxes.some((b) => b.index === index)) return null;
  const inside = list[index]!.in;
  const current = inside ? boxes.find((b) => list[b.index]!.id === inside) : undefined;
  return (
    <SelectField
      className="ed-in w-28"
      aria-label="Carried in"
      value={current ? String(current.index) : ''}
      options={[{ value: '', label: 'Loose' }, ...boxes.map((b) => ({ value: String(b.index), label: b.name }))]}
      onValueChange={(v) => setList(putInside(list, index, v === '' ? undefined : Number(v)))}
    />
  );
}

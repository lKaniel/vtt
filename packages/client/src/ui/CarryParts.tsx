import { useState } from 'react';
import {
  attunedCount,
  type Coin,
  COINS,
  type Currency,
  dropEntry,
  dropOwn,
  encumbrance,
  type InventoryEntry,
  MAX_ATTUNED,
  putInside,
  type TokenView,
  withOwn,
} from '@vtt/system-dnd5e';
import { gameContent } from '../content.ts';
import { bagLayout, carriedLook, loadText, purseText } from '../carried.ts';
import { dragTile } from '../hotbar.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { IconFace } from './Icon.tsx';
import { RemoveButton } from './SheetDetails.tsx';
import { EditButton, isOwn, NewButton, useOwnEditor } from './own/OwnEditor.tsx';
import { Button } from './kit/button.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { Input } from './kit/input.tsx';
import { NumberField } from './kit/number-field.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { SelectField } from './kit/select.tsx';
import { Toggle } from './kit/toggle.tsx';

// Coins, carried weight, attunement and the GM's inventory editor.

/** May the viewer pack and attune this creature's gear (a token they control)? */
export function canCarry({ session, kind, value }: Readonly<SheetProps>): boolean {
  return kind === 'token' && session.canControl(value as TokenView);
}

const contentOf = (p: Readonly<SheetProps>) => withOwn(gameContent(p.sheet.edition), p.value);

/** Weight carried against capacity; characters only (monsters don't count their loot). */
export function Load(props: Readonly<SheetProps>) {
  const { value, sheet } = props;
  if (value.monster) return null;
  const load = encumbrance(value, sheet.abilities.str, contentOf(props));
  return (
    <span
      className={load.over ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
      title={load.over ? 'Over capacity: speed drops to 5 ft' : 'Carried weight / carrying capacity'}
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
        onSave={(currency) => session.carry(value.id, { kind: 'coins', currency })}
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

/** Magic items that need attunement, and which of them (three at most) the creature is attuned to. */
export function Attunement(props: Readonly<SheetProps>) {
  const { value, session, edit, update } = props;
  const list = value.inventory ?? [];
  const items = contentOf(props).items;
  const needs = list.flatMap((e, i) => (items.get(e.item)?.attunement ? [i] : []));
  if (!needs.length) return null;
  const count = attunedCount(value);
  const live = canCarry(props) && !edit;
  const set = (i: number, on: boolean) => {
    if (live) session.carry(value.id, { kind: 'attune', item: i, on });
    else update((d) => ({ ...d, inventory: attuned(list, i, on) }), true);
  };
  return (
    <>
      <h4>
        Attunement {count}/{MAX_ATTUNED}
      </h4>
      <div className="flex flex-wrap gap-1">
        {needs.map((i) => (
          <Toggle
            key={i}
            pressed={list[i]!.attuned === true}
            disabled={(!live && !edit) || (!list[i]!.attuned && count >= MAX_ATTUNED)}
            onPressedChange={(on) => set(i, on)}
          >
            {carriedLook(list[i]!, props.sheet.edition, value).name}
          </Toggle>
        ))}
      </div>
    </>
  );
}

function attuned(list: readonly InventoryEntry[], index: number, on: boolean): InventoryEntry[] {
  return list.map((e, i) => {
    if (i !== index) return e;
    const { attuned: _was, ...rest } = e;
    return on ? { ...rest, attuned: true } : rest;
  });
}

/** The GM's inventory: quantities, equipped, which container each thing is in, own items. */
export function InventoryEdit(props: Readonly<SheetProps>) {
  const { value, update } = props;
  const list = value.inventory ?? [];
  const own = useOwnEditor(value, update);
  const setList = (next: InventoryEntry[], now = true) =>
    update((d) => ({ ...d, inventory: next.length ? next : undefined }), now);
  return (
    <>
      <ul className="rows ed-list">
        {list.map((e, i) => (
          <EditRow
            key={`${e.item}-${i}`}
            {...props}
            index={i}
            setList={setList}
            onOpen={() => own.open('item', e.item)}
          />
        ))}
      </ul>
      <NewButton label="New item" onClick={() => own.create('item')} />
      {own.dialog}
    </>
  );
}

interface EditRowProps extends SheetProps {
  index: number;
  setList: (next: InventoryEntry[], now?: boolean) => void;
  onOpen: () => void;
}

function EditRow(props: Readonly<EditRowProps>) {
  const { value, update, sheet, index: i, setList, onOpen } = props;
  const list = value.inventory ?? [];
  const e = list[i]!;
  const look = carriedLook(e, sheet.edition, value);
  const mine = isOwn(value, 'item', e.item);
  const change = (entry: Partial<InventoryEntry>, now = true) =>
    setList(
      list.map((x, j) => (j === i ? { ...x, ...entry } : x)),
      now,
    );
  return (
    <li className="row" draggable onDragStart={(ev) => dragTile(ev, { ref: look.ref })}>
      <IconFace icon={look.icon} size={18} />
      <span className="row-name">{look.name}</span>
      <InSelect {...props} />
      <Input
        className="ed-qty"
        type="number"
        min={1}
        value={e.qty}
        aria-label="Quantity"
        onChange={(ev) => change({ qty: Math.max(1, Number(ev.target.value) || 1) }, false)}
      />
      <label className="ed-equip" title="Equipped">
        <Checkbox checked={e.equipped} onCheckedChange={(on) => change({ equipped: on === true })} />E
      </label>
      {mine && <EditButton name={look.name} onClick={onOpen} />}
      <RemoveButton
        onClick={() => (mine ? update((d) => dropOwn(d, 'item', e.item), true) : setList(dropEntry(list, i)))}
      />
    </li>
  );
}

/** Which container an entry is packed in. */
function InSelect({ value, sheet, index, setList }: Readonly<EditRowProps>) {
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

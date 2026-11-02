import { type InventoryEntry, withOwn } from '@vtt/system-dnd5e';
import { gameContent } from '../content.ts';
import { type BagBox, bagLayout, carriedDrag, carriedLook } from '../carried.ts';
import { DRAG_TYPE } from '../drops.ts';
import { dragTile } from '../hotbar.ts';
import { attackArt } from '../icon-art.ts';
import { attackIcon } from '../icons.ts';
import { attackTip } from '../tooltip.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { Attunement, canCarry, InventoryEdit, Load, Purse } from './CarryParts.tsx';
import { IconFace } from './Icon.tsx';
import { TipCard } from './Tip.tsx';

// The sheet's gear page: attacks, coins, what it carries and how heavy that
// is, its containers and attuned magic items. An owner packs gear by
// dragging it onto a container (or back onto the bag) and attunes here; the
// GM edits it all in edit mode.

const DRAG_HINT = 'Drag onto the action bar';
/** Drags an inventory index between the bag and its containers. */
const STOW_TYPE = 'application/x-vtt-stow';

export function InventoryPage(props: Readonly<SheetProps>) {
  return (
    <>
      <h4>Attacks</h4>
      <Attacks {...props} />
      <div className="flex items-baseline justify-between gap-2">
        <h4>Inventory</h4>
        <Load {...props} />
      </div>
      <Purse {...props} />
      {props.edit ? <InventoryEdit {...props} /> : <Bag {...props} />}
      <Attunement {...props} />
    </>
  );
}

function Attacks({ sheet }: Readonly<SheetProps>) {
  return (
    <div className="bag">
      {sheet.attacks.map((a) => (
        <span
          key={a.name}
          className="bag-slot"
          tabIndex={0}
          draggable
          onDragStart={(e) => dragTile(e, { ref: `attack:${a.name}` })}
          aria-label={a.name}
          title={DRAG_HINT}
        >
          <IconFace icon={{ ...attackIcon(a), art: attackArt(a) }} size={24} />
          <TipCard tip={attackTip(a)} />
        </span>
      ))}
    </div>
  );
}

function Bag(props: Readonly<SheetProps>) {
  const { value, sheet, session } = props;
  const list = value.inventory ?? [];
  if (!list.length) return <p className="muted">Empty-handed.</p>;
  const { loose, boxes } = bagLayout(list, sheet.edition, value);
  const stow = canCarry(props)
    ? (item: number, into: number | null) => session.carry(value.id, { kind: 'stow', item, into })
    : undefined;
  return (
    <>
      <Slots {...props} indexes={loose} onStow={stow && ((i) => stow(i, null))} />
      {boxes.map((box) => (
        <Box key={box.index} {...props} box={box} onStow={stow && ((i) => stow(i, box.index))} />
      ))}
    </>
  );
}

function Box(props: Readonly<SheetProps & { box: BagBox; onStow?: (item: number) => void }>) {
  const { box } = props;
  const full = box.load > box.capacity;
  return (
    <div className="mt-2" aria-label={box.name}>
      <div className={full ? 'mb-1 text-sm text-destructive' : 'mb-1 text-sm text-muted-foreground'}>
        {box.name} · {box.load}/{box.capacity} lb
      </div>
      <Slots {...props} indexes={box.contents} empty="Drag gear here to pack it" />
    </div>
  );
}

interface SlotsProps extends SheetProps {
  indexes: number[];
  onStow?: (item: number) => void;
  empty?: string;
}

/** A grid of inventory slots, and where packed gear is dropped. */
function Slots(props: Readonly<SlotsProps>) {
  const { indexes, onStow, empty } = props;
  const list = props.value.inventory ?? [];
  const drop = onStow && {
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes(STOW_TYPE)) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      const item = Number(e.dataTransfer.getData(STOW_TYPE));
      if (!e.dataTransfer.types.includes(STOW_TYPE) || !Number.isInteger(item)) return;
      e.preventDefault();
      e.stopPropagation();
      onStow(item);
    },
  };
  return (
    <div className="bag" {...drop}>
      {indexes.map((i) => (
        <Slot key={`${list[i]!.item}-${i}`} {...props} entry={list[i]!} index={i} />
      ))}
      {!indexes.length && empty && <p className="muted col-span-full text-sm">{empty}</p>}
    </div>
  );
}

function Slot({
  session,
  value,
  kind,
  sheet,
  entry,
  index,
}: Readonly<SheetProps & { entry: InventoryEntry; index: number }>) {
  const look = carriedLook(entry, sheet.edition, value);
  const item = withOwn(gameContent(sheet.edition), value).items.get(entry.item);
  const wearable = item && (item.type !== 'gear' || item.bonus !== undefined || item.attunement === true);
  const use = () => {
    if (entry.spell) readScroll(session, value.id, entry.spell);
    else if (wearable) session.equip(value.id, index, !entry.equipped);
  };
  const cls = ['bag-slot', entry.equipped && 'equipped', entry.attuned && 'attuned'].filter(Boolean).join(' ');
  return (
    <button
      className={cls}
      aria-label={look.name}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(STOW_TYPE, String(index));
        if (kind === 'token') e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(carriedDrag(value.id, entry)));
        dragTile(e, { ref: look.ref });
      }}
      onClick={use}
    >
      <IconFace icon={look.icon} size={24} />
      {entry.qty > 1 && <span className="bag-qty">{entry.qty}</span>}
      <TipCard tip={look.tip} />
    </button>
  );
}

/** Reads a scroll: the token is selected and the scroll's spell aimed. */
function readScroll(session: SheetProps['session'], token: string, spell: string): void {
  session.select(token);
  session.aimScroll(spell);
}

import { useState } from 'react';
import {
  type Attack,
  attunedCount,
  dropEntry,
  dropOwn,
  type InventoryEntry,
  type Item,
  MAX_ATTUNED,
  SPELL_SCROLL,
} from '@vtt/system-dnd5e';
import { ShieldIcon, SparklesIcon, SwordsIcon, WandSparklesIcon } from 'lucide-react';
import { contentFor } from '../../content/content.ts';
import { t } from '../../i18n/index.ts';
import type { MessageKey } from '../../i18n/en.ts';
import { attackArt } from '../../icon-art.ts';
import { attackIcon } from '../../icons.ts';
import { carriedDrag, carriedLook } from '../../play/carried.ts';
import { DRAG_TYPE } from '../../play/drops.ts';
import { dragTile } from '../../play/hotbar.ts';
import { attackTip } from '../../text/tooltip.ts';
import { type InventorySection, inventorySections, matches, signed } from '../../text/sheet-text.ts';
import { NumberInput } from '../EditorFields.tsx';
import { RemoveButton } from '../RemoveButton.tsx';
import { EditButton, isOwn, NewButton, useOwnEditor } from '../own/OwnEditor.tsx';
import { attuned, canCarry, InSelect, Load, Purse } from './CarryParts.tsx';
import { type Column, Empty, ListRow, ListSection, RowButton, SheetSearch } from './SheetList.tsx';
import { actFromSheet, canAct, type SheetProps } from './sheet-props.ts';

// The Inventory tab, Foundry style: the attacks, then gear by kind and each
// container with what is packed in it, and the coins, carried weight and
// attunement at the foot. An owner packs gear by dragging it onto a
// container (or back out), equips and attunes with the row buttons; in edit
// mode quantities and containers become fields and things can be removed.

/** Drags an inventory index between the bag and its containers. */
const STOW_TYPE = 'application/x-vtt-stow';

const attackColumns = (): Column[] => [
  { label: t('sheet.col.hit'), className: 'w-12' },
  { label: t('sheet.col.damage'), className: 'w-32' },
  { label: t('sheet.col.range'), className: 'w-20' },
];
const gearColumns = (): Column[] => [
  { label: t('sheet.col.weight'), className: 'w-16' },
  { label: t('sheet.col.qty'), className: 'w-12' },
];
const editColumns = (): Column[] => [
  { label: t('sheet.carriedIn'), className: 'w-32' },
  { label: t('sheet.col.qty'), className: 'w-16' },
];

export function InventoryTab(props: Readonly<SheetProps>) {
  const { value, update, sheet, edit } = props;
  const [query, setQuery] = useState('');
  const own = useOwnEditor(value, update);
  const list = value.inventory ?? [];
  const look = (i: number) => carriedLook(list[i]!, sheet.edition, value);
  const sections = inventorySections(list, sheet.edition, value)
    .map((s) => ({ ...s, indexes: s.indexes.filter((i) => matches(look(i).name, query)) }))
    .filter((s) => s.container !== undefined || s.indexes.length);
  const attacks = sheet.attacks.filter((a) => matches(a.name, query));
  return (
    <>
      <SheetSearch value={query} onChange={setQuery} />
      {attacks.length > 0 && <Attacks {...props} attacks={attacks} />}
      {sections.map((s) => (
        <GearSection key={s.id} {...props} section={s} onOpen={(id) => own.open('item', id)} />
      ))}
      {!list.length && <Empty>{t('sheet.emptyHanded')}</Empty>}
      {query && !attacks.length && !sections.length && <Empty>{t('sheet.nothingFound', { query })}</Empty>}
      {edit && <NewButton label="New item" onClick={() => own.create('item')} />}
      {own.dialog}
      <InventoryFoot {...props} />
    </>
  );
}

function Attacks(props: Readonly<SheetProps & { attacks: Attack[] }>) {
  const act = canAct(props);
  const columns = attackColumns();
  return (
    <ListSection title={t('sheet.attacks')} columns={columns}>
      {props.attacks.map((a) => (
        <ListRow
          key={a.name}
          icon={{ ...attackIcon(a), art: attackArt(a) }}
          name={a.name}
          tip={attackTip(a)}
          columns={columns}
          cells={[signed(a.toHit), a.damage.map((d) => d.dice).join(' + '), attackRange(a)]}
          onDragStart={(e) => dragTile(e, { ref: `attack:${a.name}` })}
          controls={
            act && (
              <RowButton
                label={t('sheet.use', { name: a.name })}
                onClick={() => actFromSheet(props, `attack:${a.name}`)}
              >
                <SwordsIcon />
              </RowButton>
            )
          }
        />
      ))}
    </ListSection>
  );
}

const attackRange = (a: Attack) =>
  a.kind === 'melee' ? t('sheet.feet', { n: a.reach ?? 5 }) : `${a.range?.join('/') ?? ''} ft`;

interface SectionProps extends SheetProps {
  section: InventorySection;
  onOpen: (item: string) => void;
}

/** A kind of gear, or a container and what is packed in it; owners drop gear here to pack or unpack it. */
function GearSection(props: Readonly<SectionProps>) {
  const { section, session, value, edit } = props;
  const stow =
    canCarry(props) && !edit
      ? (item: number) => session.requests.carry(value.id, { kind: 'stow', item, into: section.container ?? null })
      : undefined;
  const drop = stow && {
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes(STOW_TYPE)) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      const item = Number(e.dataTransfer.getData(STOW_TYPE));
      if (!e.dataTransfer.types.includes(STOW_TYPE) || !Number.isInteger(item)) return;
      e.preventDefault();
      e.stopPropagation();
      stow(item);
    },
  };
  const columns = edit ? editColumns() : gearColumns();
  return (
    <ListSection
      title={sectionTitle(props)}
      label={section.name ?? t(`sheet.gear.${section.id}` as MessageKey)}
      columns={columns}
      drop={drop}
    >
      {section.indexes.map((i) => (
        <GearRow key={`${value.inventory![i]!.item}-${i}`} {...props} index={i} columns={columns} />
      ))}
      {section.container !== undefined && !section.indexes.length && (
        <li className="py-1 text-sm text-muted-foreground italic">{t('sheet.packHere')}</li>
      )}
    </ListSection>
  );
}

function sectionTitle({ section, value, sheet }: Readonly<SectionProps>): string {
  if (section.container === undefined) return t(`sheet.gear.${section.id}` as MessageKey);
  const entry = value.inventory![section.container]!;
  const item = contentFor(value, sheet.edition).items.get(entry.item);
  const capacity = item?.type === 'gear' ? (item.container?.capacity ?? 0) : 0;
  const load = section.indexes.reduce((n, i) => n + weightOf({ value, sheet }, i), 0);
  return t('sheet.container', { name: section.name ?? entry.item, load, capacity });
}

function itemOf({ value, sheet }: Pick<SheetProps, 'value' | 'sheet'>, i: number): Item | undefined {
  return contentFor(value, sheet.edition).items.get(value.inventory![i]!.item);
}

function weightOf(p: Pick<SheetProps, 'value' | 'sheet'>, i: number): number {
  const entry = p.value.inventory![i]!;
  return Math.round((itemOf(p, i)?.weight ?? 0) * entry.qty * 100) / 100;
}

interface RowProps extends SectionProps {
  index: number;
  columns: Column[];
}

function GearRow(p: Readonly<RowProps>) {
  const { value, kind, sheet, index, columns, edit } = p;
  const entry = value.inventory![index]!;
  const look = carriedLook(entry, sheet.edition, value);
  const weight = weightOf(p, index);
  const cells = edit
    ? [<InSelect key="in" {...p} setList={setList(p)} />, <QtyField key="qty" {...p} />]
    : [weight ? t('sheet.lb', { n: weight }) : '—', entry.qty];
  return (
    <ListRow
      icon={look.icon}
      name={look.name}
      tip={look.tip}
      columns={columns}
      cells={cells}
      faded={!edit && wearable(itemOf(p, index)) && !entry.equipped}
      onDragStart={(e) => {
        e.dataTransfer.setData(STOW_TYPE, String(index));
        if (kind === 'token') e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(carriedDrag(value.id, entry)));
        dragTile(e, { ref: look.ref });
      }}
      controls={<GearControls {...p} entry={entry} refName={look.ref} name={look.name} />}
    />
  );
}

/** Weapons, armour and magic gear are worn to work. */
const wearable = (item: Item | undefined) =>
  !!item &&
  (item.type !== 'gear' ||
    item.bonus !== undefined ||
    item.effect !== undefined ||
    item.attunement === true ||
    (item.group === 'ammunition' && !!item.plus));

const setList =
  ({ update }: Readonly<SheetProps>) =>
  (next: InventoryEntry[], now = true) =>
    update((d) => ({ ...d, inventory: next.length ? next : undefined }), now);

function QtyField(p: Readonly<RowProps>) {
  const list = p.value.inventory ?? [];
  return (
    <NumberInput
      className="h-7 text-center"
      value={list[p.index]!.qty}
      min={1}
      onChange={(v) =>
        setList(p)(
          list.map((x, j) => (j === p.index ? { ...x, qty: Math.max(1, v ?? 1) } : x)),
          false,
        )
      }
    />
  );
}

/** Use (a potion, a scroll), equip and attune; in edit mode also edit and remove. */
type ControlProps = RowProps & { entry: InventoryEntry; refName: string; name: string };

function GearControls(p: Readonly<ControlProps>) {
  const item = itemOf(p, p.index);
  const usable = p.entry.item === SPELL_SCROLL ? !!p.entry.spell : item?.type === 'gear' && !!item.use;
  return (
    <>
      {usable && canAct(p) && (
        <RowButton label={t('sheet.use', { name: p.name })} onClick={() => actFromSheet(p, p.refName)}>
          <WandSparklesIcon />
        </RowButton>
      )}
      {item?.attunement && <AttuneButton {...p} />}
      {wearable(item) && <EquipButton {...p} />}
      {p.edit && <EditControls {...p} />}
    </>
  );
}

/** Gear an owner changes through the server at the table, and the sheet's editor in the draft. */
const liveGear = (p: Readonly<ControlProps>) => canCarry(p) && !p.edit;

function AttuneButton(p: Readonly<ControlProps>) {
  const { session, value, update, entry, index } = p;
  const live = liveGear(p);
  const attune = () => {
    const on = !entry.attuned;
    if (live) session.requests.carry(value.id, { kind: 'attune', item: index, on });
    else update((d) => ({ ...d, inventory: attuned(d.inventory ?? [], index, on) }), true);
  };
  return (
    <RowButton
      label={t('sheet.attune')}
      pressed={entry.attuned === true}
      disabled={(!live && !p.edit) || (!entry.attuned && attunedCount(value) >= MAX_ATTUNED)}
      onClick={attune}
    >
      <SparklesIcon />
    </RowButton>
  );
}

function EquipButton(p: Readonly<ControlProps>) {
  const { session, value, entry, index } = p;
  const live = liveGear(p);
  const equip = () => {
    if (live) session.requests.equip(value.id, index, !entry.equipped);
    else setList(p)((value.inventory ?? []).map((x, j) => (j === index ? { ...x, equipped: !x.equipped } : x)));
  };
  return (
    <RowButton
      label={entry.equipped ? t('sheet.unequip') : t('sheet.equip')}
      pressed={entry.equipped}
      disabled={!live && !p.edit}
      onClick={equip}
    >
      <ShieldIcon />
    </RowButton>
  );
}

/** Edit mode: open an item made on this sheet, and take anything off it. */
function EditControls(p: Readonly<ControlProps>) {
  const { value, update, entry, index } = p;
  const mine = isOwn(value, 'item', entry.item);
  const remove = () =>
    mine ? update((d) => dropOwn(d, 'item', entry.item), true) : setList(p)(dropEntry(value.inventory ?? [], index));
  return (
    <>
      {mine && <EditButton name={p.name} onClick={() => p.onOpen(entry.item)} />}
      <RemoveButton onClick={remove} />
    </>
  );
}

/** Coins, carried weight and attunement, at the foot of the tab. */
function InventoryFoot(props: Readonly<SheetProps>) {
  const { value } = props;
  const needs = (value.inventory ?? []).some(
    (e) => contentFor(value, props.sheet.edition).items.get(e.item)?.attunement,
  );
  return (
    <footer className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-gold-dim/50 pt-2">
      <div className="min-w-48 flex-1">
        <Purse {...props} />
      </div>
      {needs && (
        <span className="text-sm text-muted-foreground">
          {t('sheet.attuned', { n: attunedCount(value), max: MAX_ATTUNED })}
        </span>
      )}
      <Load {...props} />
    </footer>
  );
}

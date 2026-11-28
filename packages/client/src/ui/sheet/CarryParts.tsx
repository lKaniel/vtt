import { encumbrance, type InventoryEntry, putInside, type TokenView } from '@vtt/system-dnd5e';
import { contentFor } from '../../content/content.ts';
import { bagLayout, loadText, loadTip } from '../../play/carried.ts';
import type { SheetProps } from './sheet-props.ts';
import { SelectField } from '../kit/select.tsx';
import { t } from '../../i18n/index.ts';

// Carried weight, attunement and which container gear is packed in.

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
      aria-label={t('carry.in')}
      value={current ? String(current.index) : ''}
      options={[
        { value: '', label: t('carry.loose') },
        ...boxes.map((b) => ({ value: String(b.index), label: b.name })),
      ]}
      onValueChange={(v) => setList(putInside(list, index, v === '' ? undefined : Number(v)))}
    />
  );
}

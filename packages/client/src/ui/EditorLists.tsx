import { srdFor, type Edition, type InventoryEntry } from '@vtt/shared';
import { useState } from 'react';
import { itemArt } from '../icon-art.ts';
import { itemIcon } from '../icons.ts';
import type { Session } from '../session.ts';
import { setStat } from '../token-edit.ts';
import { IconFace } from './Icon.tsx';
import type { Draft, Update } from './TokenEditor.tsx';

// The right-hand column of the GM's editor: gear, spells and effects.

const items = srdFor('2014').items;

export function GearColumn({
  session,
  value,
  update,
  rules,
}: Readonly<{ session: Session; value: Draft; update: Update; rules: Edition }>) {
  return (
    <div className="ed-col">
      <Inventory value={value} update={update} />
      <Spells value={value} update={update} rules={rules} />
      <Effects session={session} value={value} />
    </div>
  );
}

function Inventory({ value, update }: Readonly<{ value: Draft; update: Update }>) {
  const list = value.inventory ?? [];
  const setList = (next: InventoryEntry[]) => update((d) => ({ ...d, inventory: next.length ? next : undefined }));
  const change = (i: number, entry: Partial<InventoryEntry>) =>
    setList(list.map((e, j) => (j === i ? { ...e, ...entry } : e)));
  return (
    <>
      <h4>Inventory</h4>
      <ul className="rows ed-list">
        {list.map((e, i) => {
          const item = items.get(e.item);
          return (
            <li key={`${e.item}-${i}`} className="row">
              <IconFace icon={{ ...itemIcon(item), art: itemArt(item) }} size={18} />
              <span className="row-name">{item?.name ?? e.item}</span>
              <input
                className="ed-qty"
                type="number"
                min={1}
                value={e.qty}
                aria-label="Quantity"
                onChange={(ev) => change(i, { qty: Math.max(1, Number(ev.target.value) || 1) })}
              />
              <label className="ed-equip" title="Equipped">
                <input
                  type="checkbox"
                  checked={e.equipped}
                  onChange={(ev) => change(i, { equipped: ev.target.checked })}
                />
                E
              </label>
              <RemoveButton onClick={() => setList(list.filter((_, j) => j !== i))} />
            </li>
          );
        })}
      </ul>
      <Adder
        placeholder="Add an item…"
        options={[...items.values()].map((it) => ({ id: it.id, name: it.name }))}
        onAdd={(item) => setList([...list, { item, qty: 1, equipped: false }])}
      />
    </>
  );
}

function Spells({ value, update, rules }: Readonly<{ value: Draft; update: Update; rules: Edition }>) {
  const book = srdFor(rules).spells;
  const known = value.stats?.spells ?? [];
  const setKnown = (next: string[]) => update((d) => setStat(d, 'spells', next));
  return (
    <>
      <h4>Spells ({rules})</h4>
      <ul className="rows ed-list">
        {known.map((id) => (
          <li key={id} className={book.has(id) ? 'row' : 'row ed-bad'}>
            <span className="row-name">{book.get(id)?.name ?? `${id} (not in the ${rules} rules)`}</span>
            <span className="row-detail">{levelText(book.get(id)?.level)}</span>
            <RemoveButton onClick={() => setKnown(known.filter((s) => s !== id))} />
          </li>
        ))}
      </ul>
      <Adder
        placeholder="Add a spell…"
        options={[...book.values()].filter((s) => !known.includes(s.id)).map((s) => ({ id: s.id, name: s.name }))}
        onAdd={(id) => setKnown([...known, id])}
      />
    </>
  );
}

/** What affects the creature now. Ending one goes through the rules at once, so linked effects end too. */
function Effects({ session, value }: Readonly<{ session: Session; value: Draft }>) {
  const effects = value.effects ?? [];
  if (!effects.length && !value.concentration) return null;
  return (
    <>
      <h4>Effects</h4>
      <ul className="rows ed-list">
        {value.concentration && (
          <li className="row">
            <span className="row-name">Concentrating: {value.concentration.name}</span>
            <RemoveButton onClick={() => session.dropConcentration(value.id)} />
          </li>
        )}
        {effects.map((e) => (
          <li key={e.id} className="row">
            <span className="row-name">{e.name}</span>
            {e.rounds !== undefined && <span className="row-detail">{e.rounds} rounds</span>}
            <RemoveButton onClick={() => session.removeEffect(value.id, e.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}

const levelText = (level: number | undefined) => (level ? `level ${level}` : 'cantrip');

function RemoveButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <button className="ed-remove" onClick={onClick} aria-label="Remove" title="Remove">
      ×
    </button>
  );
}

/** A search box with suggestions; picking a name (or typing an id) adds it. */
function Adder({
  placeholder,
  options,
  onAdd,
}: Readonly<{ placeholder: string; options: { id: string; name: string }[]; onAdd: (id: string) => void }>) {
  const [text, setText] = useState('');
  const listId = `adder-${placeholder.replace(/\W/g, '')}`;
  const add = () => {
    const t = text.trim().toLowerCase();
    const hit = options.find((o) => o.name.toLowerCase() === t || o.id === t);
    if (!hit) return;
    onAdd(hit.id);
    setText('');
  };
  return (
    <div className="ed-adder">
      <input
        type="text"
        value={text}
        list={listId}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.id} value={o.name} />
        ))}
      </datalist>
      <button className="btn small" onClick={add}>
        Add
      </button>
    </div>
  );
}

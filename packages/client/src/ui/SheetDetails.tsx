import { isGm, type Level, levelOf } from '@vtt/shared';
import { editionOf, toEdition } from '@vtt/system-dnd5e';
import { gameContent } from '../content.ts';
import { useState } from 'react';
import { setOwnership, setStat } from '../token-edit.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { Check, Field, NumberInput, TextInput } from './EditorFields.tsx';
import { withKey, type Draft, type Update } from './sheet-model.ts';

// The Details page: who the creature is and which rules build it. Who owns
// it and whether it hides are the GM's; a trusted owner sees the rest.

const SIZES = [
  [0.5, 'Tiny'],
  [1, 'Small / Medium'],
  [2, 'Large'],
  [3, 'Huge'],
  [4, 'Gargantuan'],
] as const;

export function Details(props: Readonly<SheetProps>) {
  return (
    <div className="ed-details">
      <Identity {...props} />
      <RulesFields {...props} />
    </div>
  );
}

function Identity({ session, kind, value, update }: Readonly<SheetProps>) {
  const set =
    (key: keyof Draft, now = false) =>
    (v: unknown) =>
      update((d) => withKey(d, key, v), now);
  return (
    <div className="ed-col">
      <h4>Token</h4>
      <Field label="Picture URL" wide>
        <TextInput value={value.img} onChange={set('img')} placeholder="Default portrait" />
      </Field>
      {kind === 'actor' && (
        <Field label="Folder" wide>
          <TextInput value={value.folder} onChange={set('folder')} placeholder="No folder" />
        </Field>
      )}
      <div className="ed-grid">
        <Field label="Colour">
          <input type="color" value={value.color} onChange={(e) => set('color')(e.target.value)} />
        </Field>
        <Field label="Size">
          <select value={value.size} onChange={(e) => set('size', true)(Number(e.target.value))}>
            {SIZES.map(([n, label]) => (
              <option key={n} value={n}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Darkvision (ft)">
          <NumberInput value={value.darkvision} min={0} onChange={(v) => set('darkvision')(v ?? 0)} />
        </Field>
        <LightFields value={value} update={update} />
      </div>
      {session.isGm() && (
        <>
          <Check label="Hidden from players" checked={value.hidden} onChange={set('hidden', true)} />
          <OwnershipFields session={session} value={value} update={update} />
        </>
      )}
    </div>
  );
}

function LightFields({ value, update }: Readonly<{ value: Draft; update: Update }>) {
  const setLight = (bright: number | undefined, dim: number | undefined) =>
    update((d) => withKey(d, 'light', bright || dim ? { bright: bright ?? 0, dim: dim ?? 0 } : undefined));
  return (
    <>
      <Field label="Light, bright (ft)">
        <NumberInput
          value={value.light?.bright}
          min={0}
          onChange={(v) => setLight(v, value.light?.dim)}
          placeholder="none"
        />
      </Field>
      <Field label="Light, dim (ft)">
        <NumberInput
          value={value.light?.dim}
          min={0}
          onChange={(v) => setLight(value.light?.bright, v)}
          placeholder="none"
        />
      </Field>
    </>
  );
}

const LEVELS: readonly [Level, string][] = [
  ['none', 'None'],
  ['limited', 'Limited'],
  ['observer', 'Observer'],
  ['owner', 'Owner'],
];

/**
 * Foundry-style ownership levels: none (doesn't know it is there), limited
 * (sees it, not its sheet), observer (reads the sheet, sees through its
 * eyes), owner (acts with it, and edits it if trusted). "Everyone" is the
 * level of players not listed.
 */
function OwnershipFields({ session, value, update }: Readonly<Pick<SheetProps, 'session' | 'value' | 'update'>>) {
  const players = session.players.filter((p) => !isGm(p));
  if (!players.length) return null;
  const ownership = value.ownership;
  const rows: { id: string; name: string; level: Level; observer?: boolean }[] = [
    { id: 'default', name: 'Everyone', level: ownership?.default ?? 'limited' },
    ...players.map((p) => ({ id: p.id, name: p.name, level: levelOf(value, p), observer: p.role === 'observer' })),
  ];
  return (
    <>
      <h4>Ownership</h4>
      <div className="ed-grid">
        {rows.map((p) => (
          <Field key={p.id} label={p.name}>
            <select
              value={p.level}
              disabled={p.observer}
              title={p.observer ? 'An observer seat only watches' : undefined}
              onChange={(e) => update((d) => setOwnership(d, p.id, e.target.value as Level), true)}
            >
              {LEVELS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
    </>
  );
}

function RulesFields({ session, value, update }: Readonly<SheetProps>) {
  const stat =
    (key: Parameters<typeof setStat>[1], now = false) =>
    (v: unknown) =>
      update((d) => setStat(d, key, v), now);
  const rules = editionOf(value, session.world ?? {});
  return (
    <div className="ed-col">
      <h4>Rules</h4>
      <Field label="Monster stat block" wide>
        <TextInput
          value={value.monster}
          onChange={(v) => update((d) => withKey(d, 'monster', v))}
          list="sheet-monsters"
          placeholder="none: a character"
        />
      </Field>
      <datalist id="sheet-monsters">
        {[...gameContent(rules).monsters.values()].map((m) => (
          <option key={m.id} value={m.id} label={m.name} />
        ))}
      </datalist>
      <Field label="Rules" wide>
        <select value={value.stats?.rules ?? ''} onChange={(e) => stat('rules', true)(e.target.value || undefined)}>
          <option value="">World ({toEdition(session.world?.rules)})</option>
          <option value="2014">2014 (SRD 5.1)</option>
          <option value="2024">2024 (SRD 5.2)</option>
        </select>
      </Field>
      <div className="ed-grid">
        <Field label="Class">
          <TextInput value={value.stats?.class} onChange={stat('class')} placeholder="none" />
        </Field>
        <Field label="Level">
          <NumberInput value={value.stats?.level} min={1} onChange={stat('level')} placeholder="—" />
        </Field>
      </div>
    </div>
  );
}

export function RemoveButton({ onClick, className = '' }: Readonly<{ onClick: () => void; className?: string }>) {
  return (
    <button
      className={`ed-remove ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label="Remove"
      title="Remove"
    >
      ×
    </button>
  );
}

/** A search box with suggestions; picking a name (or typing an id) adds it. */
export function Adder({
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

import { XIcon } from 'lucide-react';
import { isGm, type Level, levelOf } from '@vtt/shared';
import { editionOf, toEdition } from '@vtt/system-dnd5e';
import { gameContent } from '../content.ts';
import { setOwnership, setStat } from '../token-edit.ts';
import type { SheetProps } from './CharacterSheet.tsx';
import { ClassesEdit } from './ClassesEdit.tsx';
import { Check, Field, NumberInput, TextInput } from './EditorFields.tsx';
import { LookFields } from './SheetLook.tsx';
import { withKey, type Draft, type Update } from './sheet-model.ts';
import { Button } from './kit/button.tsx';
import { ColorInput } from './kit/color-input.tsx';
import { SelectField } from './kit/select.tsx';

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
          <ColorInput value={value.color} onChange={(e) => set('color')(e.target.value)} />
        </Field>
        <Field label="Size">
          <SelectField
            value={String(value.size)}
            onValueChange={(n) => set('size', true)(Number(n))}
            options={SIZES.map(([n, label]) => ({ value: String(n), label }))}
          />
        </Field>
        <Field label="Darkvision (ft)">
          <NumberInput value={value.darkvision} min={0} onChange={(v) => set('darkvision')(v ?? 0)} />
        </Field>
        <LightFields value={value} update={update} />
      </div>
      <LookFields value={value} update={update} />
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
            <SelectField
              value={p.level}
              disabled={p.observer}
              title={p.observer ? 'An observer seat only watches' : undefined}
              onValueChange={(v) => update((d) => setOwnership(d, p.id, v as Level), true)}
              options={LEVELS.map(([v, label]) => ({ value: v, label }))}
            />
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
        <SelectField
          value={value.stats?.rules ?? ''}
          onValueChange={(r) => stat('rules', true)(r || undefined)}
          options={[
            { value: '', label: `World (${toEdition(session.world?.rules)})` },
            { value: '2014', label: '2014 (SRD 5.1)' },
            { value: '2024', label: '2024 (SRD 5.2)' },
          ]}
        />
      </Field>
      <ClassesEdit value={value} update={update} />
    </div>
  );
}

export function RemoveButton({ onClick, className = '' }: Readonly<{ onClick: () => void; className?: string }>) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={`ed-remove ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label="Remove"
      title="Remove"
    >
      <XIcon />
    </Button>
  );
}

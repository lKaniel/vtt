import { isGm, type Level, levelOf } from '@vtt/shared';
import { setOwnership } from '../../play/token-edit.ts';
import { Check, Field, NumberInput, TextInput } from '../EditorFields.tsx';
import { ColorInput } from '../kit/color-input.tsx';
import { SelectField } from '../kit/select.tsx';
import { withKey, type Draft, type Update } from '../sheet-model.ts';
import { LookFields } from './SheetLook.tsx';
import type { SheetProps } from './sheet-props.ts';

// The Token tab, in edit mode: how the creature stands on the map (picture,
// colour, size, vision and light, its look) and, for the GM, whether it
// hides and who owns it.

const SIZES = [
  [0.5, 'Tiny'],
  [1, 'Small / Medium'],
  [2, 'Large'],
  [3, 'Huge'],
  [4, 'Gargantuan'],
] as const;

export function TokenTab(props: Readonly<SheetProps>) {
  return (
    <div className="grid grid-cols-2 gap-6">
      <Identity {...props} />
      <div className="ed-col">
        <LookFields value={props.value} update={props.update} />
      </div>
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

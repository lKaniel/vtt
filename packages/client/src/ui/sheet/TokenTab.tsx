import { isGm, isTrusted, type Level, levelOf } from '@vtt/shared';
import type { Session } from '../../session/session.ts';
import { setOwnership } from '../../play/token-edit.ts';
import { Check, Field, NumberInput } from '../EditorFields.tsx';
import { MediaInput } from '../MediaPicker.tsx';
import { ColorInput } from '../kit/color-input.tsx';
import { SelectField } from '../kit/select.tsx';
import { withKey, type Draft, type Update } from '../sheet-model.ts';
import { LookFields } from './SheetLook.tsx';
import { LooksFields } from './SheetLooks.tsx';
import type { SheetProps } from './sheet-props.ts';

// The Token tab, in edit mode: how the creature stands on the map (picture,
// colour, its look); for the GM and trusted players its size, vision and
// light; for the GM whether it hides and who owns it.

const SIZES = [
  [0.5, 'Tiny'],
  [1, 'Small / Medium'],
  [2, 'Large'],
  [3, 'Huge'],
  [4, 'Gargantuan'],
] as const;

/** Sets one field of the draft; `now` saves at once. */
const setter =
  (update: Update) =>
  (key: keyof Draft, now = false) =>
  (v: unknown) =>
    update((d) => withKey(d, key, v), now);

export function TokenTab(props: Readonly<SheetProps>) {
  return (
    <div className="grid grid-cols-2 gap-6">
      <Identity {...props} />
      <div className="ed-col">
        <LookFields value={props.value} update={props.update} />
      </div>
      <LooksFields session={props.session} value={props.value} update={props.update} />
    </div>
  );
}

function Identity({ session, value, update }: Readonly<SheetProps>) {
  const set = setter(update);
  return (
    <div className="ed-col">
      <h4>Token</h4>
      {/* Not a <label> like Field: the upload button inside is one. */}
      <div className="ed-field wide">
        <span>Picture</span>
        <MediaInput
          key={value.img ?? ''}
          session={session}
          kind="image"
          value={value.img ?? ''}
          onChange={(src) => set('img', true)(src || undefined)}
          placeholder="Default portrait: upload, pick, or paste a web address"
          label="Picture"
        />
      </div>
      <div className="ed-grid">
        <Field label="Colour">
          <ColorInput value={value.color} onChange={(e) => set('color')(e.target.value)} />
        </Field>
        {trusted(session) && <BuildFields value={value} update={update} />}
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

/** The GM, or a trusted seat: they change how big their creature is and what it sees (permissions.ts). */
const trusted = (session: Session) => !!session.you && isTrusted(session.you);

/** How big it is, what it sees and the light it gives: the GM's and trusted players', so a player can't break their token. */
function BuildFields({ value, update }: Readonly<{ value: Draft; update: Update }>) {
  const set = setter(update);
  return (
    <>
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
    </>
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
 * Foundry-style ownership levels: none (sees the token only), limited
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

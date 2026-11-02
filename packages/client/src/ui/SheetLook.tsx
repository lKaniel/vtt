import { type DisplayMode, DisplayModeSchema } from '@vtt/shared';
import type { SheetProps } from './CharacterSheet.tsx';
import { Check, Field, NumberInput } from './EditorFields.tsx';
import { ColorInput } from './kit/color-input.tsx';
import { SelectField } from './kit/select.tsx';
import { withKey, type Draft } from './sheet-model.ts';

// The token's look on the map (shared/token-look.ts): when its name and
// bars show, how big its picture is drawn, mirroring, and a ring.

const MODES: Record<DisplayMode, string> = {
  always: 'Always',
  owner: 'To owners',
  hover: 'On hover',
  ownerHover: 'On hover, to owners',
  control: 'While selected',
  never: 'Never',
};
const MODE_OPTIONS = DisplayModeSchema.options.map((m) => ({ value: m, label: MODES[m] }));

export function LookFields({ value, update }: Readonly<Pick<SheetProps, 'value' | 'update'>>) {
  const set =
    (key: keyof Draft, now = false) =>
    (v: unknown) =>
      update((d) => withKey(d, key, v), now);
  const mode = (key: 'displayName' | 'displayBars') => (v: string) => set(key, true)(v === 'always' ? undefined : v);
  const ring = value.ring;
  return (
    <>
      <h4>Look</h4>
      <div className="ed-grid">
        <Field label="Name shows">
          <SelectField
            value={value.displayName ?? 'always'}
            onValueChange={mode('displayName')}
            options={MODE_OPTIONS}
          />
        </Field>
        <Field label="Bars show">
          <SelectField
            value={value.displayBars ?? 'always'}
            onValueChange={mode('displayBars')}
            options={MODE_OPTIONS}
          />
        </Field>
        <Field label="Picture scale">
          <NumberInput value={value.scale} min={0.2} placeholder={1} onChange={set('scale')} />
        </Field>
        {ring && (
          <Field label="Ring colour">
            <ColorInput
              value={ring.color ?? value.color}
              onChange={(e) => set('ring')({ ...ring, color: e.target.value })}
            />
          </Field>
        )}
      </div>
      <Check
        label="Mirror left to right"
        checked={!!value.mirrorX}
        onChange={(v) => set('mirrorX', true)(v || undefined)}
      />
      <Check
        label="Mirror upside down"
        checked={!!value.mirrorY}
        onChange={(v) => set('mirrorY', true)(v || undefined)}
      />
      <Check label="Ring" checked={!!ring} onChange={(v) => set('ring', true)(v ? {} : undefined)} />
    </>
  );
}

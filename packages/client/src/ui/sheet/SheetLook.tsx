import { type DisplayMode, DisplayModeSchema } from '@vtt/shared';
import type { SheetProps } from './sheet-props.ts';
import { Check, Field, NumberInput } from '../EditorFields.tsx';
import { ColorInput } from '../kit/color-input.tsx';
import { SelectField } from '../kit/select.tsx';
import { withKey, type Draft } from '../sheet-model.ts';
import { type MessageKey, t } from '../../i18n/index.ts';

// The token's look on the map (shared/token-look.ts): when its name and
// bars show, how big its picture is drawn, mirroring, and a ring.

const MODES: Record<DisplayMode, MessageKey> = {
  always: 'look.always',
  owner: 'look.owner',
  hover: 'look.hover',
  ownerHover: 'look.ownerHover',
  control: 'look.control',
  never: 'look.never',
};
const modeOptions = () => DisplayModeSchema.options.map((m) => ({ value: m, label: t(MODES[m]) }));

export function LookFields({ value, update }: Readonly<Pick<SheetProps, 'value' | 'update'>>) {
  const set =
    (key: keyof Draft, now = false) =>
    (v: unknown) =>
      update((d) => withKey(d, key, v), now);
  const mode = (key: 'displayName' | 'displayBars') => (v: string) => set(key, true)(v === 'always' ? undefined : v);
  const ring = value.ring;
  const MODE_OPTIONS = modeOptions();
  return (
    <>
      <h4>{t('look.title')}</h4>
      <div className="ed-grid">
        <Field label={t('look.name')}>
          <SelectField
            value={value.displayName ?? 'always'}
            onValueChange={mode('displayName')}
            options={MODE_OPTIONS}
          />
        </Field>
        <Field label={t('look.bars')}>
          <SelectField
            value={value.displayBars ?? 'always'}
            onValueChange={mode('displayBars')}
            options={MODE_OPTIONS}
          />
        </Field>
        <Field label={t('look.scale')}>
          <NumberInput value={value.scale} min={0.2} placeholder={1} onChange={set('scale')} />
        </Field>
        {ring && (
          <Field label={t('look.ringColour')}>
            <ColorInput
              value={ring.color ?? value.color}
              onChange={(e) => set('ring')({ ...ring, color: e.target.value })}
            />
          </Field>
        )}
      </div>
      <Check
        label={t('look.mirrorX')}
        checked={!!value.mirrorX}
        onChange={(v) => set('mirrorX', true)(v || undefined)}
      />
      <Check
        label={t('look.mirrorY')}
        checked={!!value.mirrorY}
        onChange={(v) => set('mirrorY', true)(v || undefined)}
      />
      <Check label={t('look.ring')} checked={!!ring} onChange={(v) => set('ring', true)(v ? {} : undefined)} />
      <Check
        label={t('look.random')}
        checked={!!value.randomImg}
        onChange={(v) => set('randomImg', true)(v || undefined)}
      />
    </>
  );
}

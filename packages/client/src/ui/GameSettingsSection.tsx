import { dnd5e, type GameSettings, gameSettingsOf, toEdition } from '@vtt/system-dnd5e';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Label } from './kit/label.tsx';
import { Separator } from './kit/separator.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

// The GM's options for the whole game, in the settings menu: the rules
// edition it plays and its table rules. Changing them starts every seat over
// with the new rules.

const ENCUMBRANCE = ['capacity', 'variant', 'off'] as const;
const encumbranceOptions = () => ENCUMBRANCE.map((value) => ({ value, label: t(`settings.encumbrance.${value}`) }));
const FLANKING = ['off', 'on'] as const;
const flankingOptions = () => FLANKING.map((value) => ({ value, label: t(`settings.flanking.${value}`) }));

function Choice({
  label,
  value,
  options,
  hint,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  hint?: string;
  onChange: (v: string) => void;
}>) {
  return (
    <Label className="flex-col items-stretch gap-1">
      {label}
      <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v)} aria-label={label}>
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {hint && <span className="muted text-xs font-normal">{hint}</span>}
    </Label>
  );
}

const EDITIONS = dnd5e.editions.map((e) => ({ value: e.id, label: e.id }));

/** GM: the rules edition and the table rules the whole game plays. */
export function GameSettingsSection({ session }: Readonly<{ session: Session }>) {
  const rules = toEdition(session.world?.rules);
  const settings = gameSettingsOf(session.world?.settings);
  const set = (next: { rules?: string; settings?: Partial<GameSettings> }) =>
    session.requests.setGameSettings(next.rules ?? rules, { ...settings, ...next.settings });
  return (
    <section className="flex flex-col gap-3" data-slot="game-settings">
      <Separator />
      <strong className="font-display">{t('settings.game')}</strong>
      <span className="muted -mt-2 text-xs">{t('settings.gameHint')}</span>
      <Separator ornate />
      <Choice
        label={t('settings.rules')}
        value={rules}
        options={EDITIONS}
        hint={dnd5e.editions.find((e) => e.id === rules)?.name}
        onChange={(r) => set({ rules: r })}
      />
      <Choice
        label={t('settings.encumbrance')}
        value={settings.encumbrance}
        options={encumbranceOptions()}
        hint={t(`settings.encumbrance.${settings.encumbrance}Hint`)}
        onChange={(e) => set({ settings: { encumbrance: e as GameSettings['encumbrance'] } })}
      />
      <Choice
        label={t('settings.flanking')}
        value={settings.flanking}
        options={flankingOptions()}
        hint={t(`settings.flanking.${settings.flanking}Hint`)}
        onChange={(f) => set({ settings: { flanking: f as GameSettings['flanking'] } })}
      />
    </section>
  );
}

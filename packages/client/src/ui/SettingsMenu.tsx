import { SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import { currentMotion, type Motion, setMotion } from '../play/animations.ts';
import { currentDice, type DiceChoice, setDice } from '../dice/dice-throw.ts';
import { type Automation, automationOf } from '@vtt/system-dnd5e';
import type { Session } from '../session/session.ts';
import { i18n, type MessageKey, t, useLanguage } from '../i18n/index.ts';
import { Button } from './kit/button.tsx';
import { SelectField } from './kit/select.tsx';
import { Label } from './kit/label.tsx';
import { GameSettingsSection } from './GameSettingsSection.tsx';
import { KeysDialog } from './KeysDialog.tsx';
import { ProfileRow } from './ProfileRow.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { Separator } from './kit/separator.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

/** A choice and its words, as keys into the string tables (i18n/en.ts). */
interface Choice<K extends keyof Automation> {
  key: K;
  label: MessageKey;
  hint: MessageKey;
  options: { value: Automation[K]; label: MessageKey }[];
}

const OPPORTUNITY: Choice<'opportunity'> = {
  key: 'opportunity',
  label: 'settings.opportunity',
  hint: 'settings.opportunityHint',
  options: [
    { value: 'ask', label: 'settings.ask' },
    { value: 'auto', label: 'settings.attackAtOnce' },
    { value: 'never', label: 'settings.never' },
  ],
};

const HIT: Choice<'hitReactions'> = {
  key: 'hitReactions',
  label: 'settings.hit',
  hint: 'settings.hitHint',
  options: [
    { value: 'ask', label: 'settings.ask' },
    { value: 'never', label: 'settings.letItLand' },
  ],
};

function AutomationRow<K extends keyof Automation>({
  choice,
  value,
  onChange,
}: Readonly<{ choice: Choice<K>; value: Automation[K]; onChange: (v: Automation[K]) => void }>) {
  return (
    <Label className="flex-col items-stretch gap-1">
      {t(choice.label)}
      <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as Automation[K])}>
        {choice.options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value}>
            {t(o.label)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className="muted text-xs font-normal">{t(choice.hint)}</span>
    </Label>
  );
}

/** Your own options for this game, kept on your seat: how much of the rules runs itself for you. */
export function SettingsMenu({ session }: Readonly<{ session: Session }>) {
  const automation = automationOf(session.you?.settings);
  const set = (patch: Partial<Automation>) => session.requests.setSeatSettings({ ...automation, ...patch });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('settings.open')} title={t('settings.title')}>
          <SettingsIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[340px] flex-col gap-3" data-slot="settings-menu">
        <ProfileRow session={session} />
        <Separator />
        <strong className="font-display">{t('settings.automation')}</strong>
        <span className="muted -mt-2 text-xs">{t('settings.automationHint')}</span>
        <Separator ornate />
        <AutomationRow
          choice={OPPORTUNITY}
          value={automation.opportunity}
          onChange={(opportunity) => set({ opportunity })}
        />
        <AutomationRow
          choice={HIT}
          value={automation.hitReactions}
          onChange={(hitReactions) => set({ hitReactions })}
        />
        {session.isGm() && <GameSettingsSection session={session} />}
        <Separator />
        <MotionRow />
        <DiceRow />
        <LanguageRow />
        <KeysDialog />
      </PopoverContent>
    </Popover>
  );
}

const MOTIONS: readonly Motion[] = ['full', 'reduced', 'off'];

/** How much of the attack and spell animations this browser plays. */
function MotionRow() {
  const [motion, choose] = useState(currentMotion);
  const set = (m: Motion) => {
    setMotion(m);
    choose(m);
  };
  return (
    <Label className="flex-col items-stretch gap-1">
      {t('settings.animations')}
      <ToggleGroup type="single" value={motion} onValueChange={(v) => v && set(v as Motion)}>
        {MOTIONS.map((m) => (
          <ToggleGroupItem key={m} value={m}>
            {t(`settings.motion.${m}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className="muted text-xs font-normal">{t('settings.animationsHint')}</span>
    </Label>
  );
}

/** The language of the table's words in this browser: English, or one a plugin offers. */
function LanguageRow() {
  const lang = useLanguage();
  const options = i18n.languages().map((l) => ({ value: l.lang, label: l.name }));
  return (
    <Label className="flex-col items-stretch gap-1">
      {t('lang.label')}
      <SelectField
        value={lang}
        options={options}
        aria-label={t('lang.label')}
        onValueChange={(v) => void i18n.use(v)}
      />
      <span className="muted text-xs font-normal">{t('lang.hint')}</span>
    </Label>
  );
}

/** Whether rolls throw 3D dice across this browser's screen. */
function DiceRow() {
  const [dice, choose] = useState(currentDice);
  const set = (d: DiceChoice) => {
    setDice(d);
    choose(d);
  };
  return (
    <Label className="flex-col items-stretch gap-1">
      {t('settings.dice')}
      <ToggleGroup type="single" value={dice} onValueChange={(v) => v && set(v as DiceChoice)}>
        <ToggleGroupItem value="on">{t('settings.dice.on')}</ToggleGroupItem>
        <ToggleGroupItem value="off">{t('settings.dice.off')}</ToggleGroupItem>
      </ToggleGroup>
    </Label>
  );
}

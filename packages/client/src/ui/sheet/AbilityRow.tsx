import { type Ability, ABILITIES, abilityMod } from '@vtt/system-dnd5e';
import { cn } from '@/lib/utils';
import { t } from '../../i18n/index.ts';
import type { MessageKey } from '../../i18n/en.ts';
import { setAbility } from '../../play/token-edit.ts';
import { signed } from '../../text/sheet-text.ts';
import { NumberInput } from '../EditorFields.tsx';
import { Button } from '../kit/button.tsx';
import { canAct, type SheetProps } from './sheet-props.ts';

// The six abilities across the sheet, under the name: the modifier (click
// to roll a check), the score, and the saving throw (click to roll it; a
// filled dot when proficient).

export const abilityName = (a: Ability) => t(`sheet.ability.${a}` as MessageKey);

export function AbilityRow(props: Readonly<SheetProps>) {
  return (
    <div className="grid grid-cols-6 gap-2 border-b border-gold-dim/40 px-5 py-2">
      {ABILITIES.map((a) => (
        <AbilityBox key={a} {...props} ability={a} />
      ))}
    </div>
  );
}

function AbilityBox(props: Readonly<SheetProps & { ability: Ability }>) {
  const { session, value, update, sheet, edit, ability: a } = props;
  const roll = canAct(props);
  const check = (save?: boolean) => session.requests.rollCheck(value.id, { ability: a, ...(save && { save }) });
  const name = abilityName(a);
  const proficient = sheet.proficientSaves?.includes(a) === true;
  return (
    <div className="flex flex-col items-center rounded-[3px] art-hairline px-1 pt-1 pb-1.5" title={name}>
      <span className="font-display text-xs tracking-[0.2em] text-muted-foreground">{a.toUpperCase()}</span>
      <Button
        variant="ghost"
        className="h-8 px-2 font-display text-2xl text-gold-bright disabled:opacity-100"
        disabled={!roll}
        aria-label={t('sheet.checkOf', { ability: name })}
        title={roll ? t('sheet.rollCheck') : undefined}
        onClick={() => check()}
      >
        {signed(abilityMod(sheet.abilities[a]))}
      </Button>
      {edit ? (
        <NumberInput
          className="h-6 w-14 text-center text-xs"
          value={value.stats?.abilities?.[a]}
          min={1}
          placeholder={sheet.abilities[a]}
          onChange={(v) => update((d) => setAbility(d, a, v))}
        />
      ) : (
        <span className="text-xs text-muted-foreground" aria-label={t('sheet.score')}>
          {sheet.abilities[a]}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-0.5 h-6 gap-1 px-1.5 font-body text-xs text-foreground disabled:opacity-100"
        disabled={!roll}
        aria-label={t('sheet.saveOf', { ability: name })}
        title={roll ? t('sheet.rollSave') : undefined}
        onClick={() => check(true)}
      >
        <span
          className={cn('size-2 rounded-full border border-gold', proficient && 'bg-gold-bright')}
          aria-label={proficient ? t('sheet.proficient') : undefined}
        />
        {t('sheet.save')} {signed(sheet.saves[a])}
      </Button>
    </div>
  );
}

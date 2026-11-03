import { hitDiceOf, isDying, MAX_EXHAUSTION, type TokenView } from '@vtt/system-dnd5e';
import { ShieldIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';
import { t } from '../../i18n/index.ts';
import { setStat } from '../../play/token-edit.ts';
import { signed } from '../../text/sheet-text.ts';
import { exhaustionText, hitDiceText } from '../../text/vigour-text.ts';
import { NumberInput } from '../EditorFields.tsx';
import { EffectBadges, Face, HpBar } from '../Portrait.tsx';
import { Button } from '../kit/button.tsx';
import { withKey } from '../sheet-model.ts';
import type { SheetProps } from './sheet-props.ts';

// The left of the sheet: the portrait with its armour class, hit points, hit
// dice, death saves and exhaustion, and initiative, speed and proficiency.

export function SheetSidebar(props: Readonly<SheetProps>) {
  const { value, sheet } = props;
  return (
    <div className="flex w-[236px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-gold-dim/40 px-4 py-3">
      <div className="relative mx-auto mt-1 w-[184px]">
        <Face token={{ x: 0, y: 0, ...value }} className="hero-face block h-[212px]" />
        <ArmourClass {...props} />
      </div>
      <EffectBadges token={{ x: 0, y: 0, ...value }} />
      <HitPoints {...props} />
      <HitDice {...props} />
      {isDying(value) && <DeathSaves {...props} />}
      {!value.monster && <Exhaustion {...props} />}
      <div className="grid grid-cols-3 gap-1.5">
        <Pill label={t('sheet.initiative')}>{signed(sheet.initiative)}</Pill>
        <Speed {...props} />
        <Proficiency {...props} />
      </div>
    </div>
  );
}

/** The armour class on a shield over the portrait's corner. */
function ArmourClass({ value, update, sheet, edit }: Readonly<SheetProps>) {
  return (
    <div
      className="absolute -bottom-2 -left-3 flex size-14 items-center justify-center text-gold-bright"
      title={t('sheet.armour')}
    >
      <ShieldIcon className="absolute size-14 fill-black/80 stroke-gold" strokeWidth={1.4} />
      {edit ? (
        <NumberInput
          className="relative h-6 w-10 px-0 text-center font-display text-sm"
          value={value.stats?.ac}
          placeholder={sheet.ac}
          onChange={(v) => update((d) => setStat(d, 'ac', v))}
        />
      ) : (
        <span className="relative font-display text-xl" aria-label={t('sheet.armour')}>
          {sheet.ac}
        </span>
      )}
    </div>
  );
}

function Label({ children, aside }: Readonly<{ children: ReactNode; aside?: ReactNode }>) {
  return (
    <div className="mb-1 flex items-baseline justify-between font-display text-xs tracking-widest text-gold uppercase">
      {children}
      {aside && <span className="font-body text-xs tracking-normal text-muted-foreground normal-case">{aside}</span>}
    </div>
  );
}

function HitPoints(props: Readonly<SheetProps>) {
  const { value, sheet, edit } = props;
  const temp = sheet.tempHp > 0 ? `+${sheet.tempHp} ${t('sheet.tempHp').toLowerCase()}` : undefined;
  return (
    <section>
      <Label aside={temp}>{t('sheet.hp')}</Label>
      {edit ? <HpEdit {...props} /> : <HpBar token={{ x: 0, y: 0, ...value, sheet }} />}
    </section>
  );
}

/** Hit points, maximum and temporary hit points, plus quick damage and healing. */
function HpEdit({ value, update, sheet }: Readonly<SheetProps>) {
  const [amount, setAmount] = useState<number | undefined>();
  const apply = (sign: number) => {
    if (!amount) return;
    const hp = Math.min(sheet.maxHp, Math.max(0, (value.hp ?? sheet.maxHp) + sign * amount));
    update((d) => withKey(d, 'hp', hp >= sheet.maxHp ? undefined : hp), true);
    setAmount(undefined);
  };
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <SmallField label={t('sheet.hp')}>
        <NumberInput value={value.hp} placeholder={sheet.maxHp} onChange={(v) => update((d) => withKey(d, 'hp', v))} />
      </SmallField>
      <SmallField label={t('sheet.hpMax')}>
        <NumberInput
          value={value.stats?.maxHp}
          min={1}
          placeholder={sheet.maxHp}
          onChange={(v) => update((d) => setStat(d, 'maxHp', v))}
        />
      </SmallField>
      <SmallField label={t('sheet.tempHp')}>
        <NumberInput
          value={value.tempHp}
          min={0}
          onChange={(v) => update((d) => withKey(d, 'tempHp', v === 0 ? undefined : v))}
        />
      </SmallField>
      <NumberInput value={amount} min={0} onChange={setAmount} placeholder="±" />
      <Button variant="outline" size="sm" onClick={() => apply(-1)} title={t('sheet.damage')}>
        {t('sheet.hit')}
      </Button>
      <Button variant="outline" size="sm" onClick={() => apply(1)} title={t('sheet.heal')}>
        {t('sheet.heal')}
      </Button>
    </div>
  );
}

function SmallField({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] tracking-wide text-muted-foreground uppercase">
      {label}
      {children}
    </label>
  );
}

/** Hit dice left; an owner spends one on a short rest, outside fights. */
function HitDice({ session, value, kind, sheet }: Readonly<SheetProps>) {
  const dice = hitDiceOf(value, sheet);
  if (!dice) return null;
  const mine = kind === 'token' && session.canControl(value as TokenView);
  const hurt = sheet.hp < sheet.maxHp && sheet.hp > 0;
  return (
    <section className="flex items-center justify-between gap-2">
      <div>
        <Label>{t('sheet.hitDice')}</Label>
        <span className="text-sm">{hitDiceText(dice)}</span>
      </div>
      {mine && (
        <Button
          variant="outline"
          size="sm"
          disabled={!dice.left || !hurt}
          title={t('sheet.spendHitDie')}
          onClick={() => session.requests.spendHitDie(value.id)}
        >
          {t('sheet.spend')}
        </Button>
      )}
    </section>
  );
}

/** Three successes to become stable, three failures to die. */
function DeathSaves({ value }: Readonly<SheetProps>) {
  const saves = value.deathSaves ?? { successes: 0, failures: 0 };
  const row = (n: number, tone: string) =>
    Array.from({ length: 3 }, (_, k) => (
      <span key={k} className={cn('size-3 rounded-full border', k < n ? tone : 'border-muted-foreground')} />
    ));
  return (
    <section>
      <Label aside={`${saves.successes} / ${saves.failures}`}>{t('sheet.deathSaves')}</Label>
      <div className="flex items-center gap-3">
        <span className="flex gap-1">{row(saves.successes, 'border-[#6fa86a] bg-[#6fa86a]')}</span>
        <span className="flex gap-1">{row(saves.failures, 'border-destructive bg-destructive')}</span>
      </div>
    </section>
  );
}

/** Six levels of exhaustion; the GM sets them by clicking. */
function Exhaustion({ session, value, kind, update, edit, sheet }: Readonly<SheetProps>) {
  const level = value.exhaustion ?? 0;
  const canSet = session.isGm() || edit;
  const set = (n: number) => {
    if (kind === 'token' && !edit) session.requests.setExhaustion(value.id, n);
    else update((d) => ({ ...d, exhaustion: n || undefined }), true);
  };
  return (
    <section title={exhaustionText(level, sheet.edition)}>
      <Label aside={level ? exhaustionText(level, sheet.edition) : undefined}>{t('sheet.exhaustion')}</Label>
      <div className="flex gap-1">
        {Array.from({ length: MAX_EXHAUSTION }, (_, k) => (
          <Button
            key={k}
            variant="ghost"
            className={cn(
              'size-5 rounded-full border border-gold-dim p-0 font-body text-[10px] disabled:opacity-100',
              k < level && 'border-destructive bg-destructive/60 text-foreground',
            )}
            disabled={!canSet}
            aria-label={t('sheet.exhaustionLevel', { n: k + 1 })}
            aria-pressed={k < level}
            onClick={() => set(level === k + 1 ? k : k + 1)}
          >
            {k + 1}
          </Button>
        ))}
      </div>
    </section>
  );
}

function Pill({ label, title, children }: Readonly<{ label: string; title?: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col items-center rounded-[3px] art-hairline px-1 py-1" title={title ?? label}>
      <span className="font-display text-base text-gold-bright">{children}</span>
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</span>
    </div>
  );
}

function Speed({ value, update, sheet, edit }: Readonly<SheetProps>) {
  return (
    <Pill label={t('sheet.speed')}>
      {edit ? (
        <NumberInput
          className="h-6 px-0 text-center text-sm"
          value={value.speed}
          min={0}
          onChange={(v) => update((d) => ({ ...d, speed: v ?? 30 }))}
        />
      ) : (
        t('sheet.feet', { n: sheet.speed })
      )}
    </Pill>
  );
}

function Proficiency({ value, update, sheet, edit }: Readonly<SheetProps>) {
  return (
    <Pill label={t('sheet.prof')} title={t('sheet.proficiency')}>
      {edit ? (
        <NumberInput
          className="h-6 px-0 text-center text-sm"
          value={value.stats?.proficiency}
          placeholder={sheet.proficiency}
          onChange={(v) => update((d) => setStat(d, 'proficiency', v))}
        />
      ) : (
        signed(sheet.proficiency)
      )}
    </Pill>
  );
}

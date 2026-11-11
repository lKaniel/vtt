import { type CritChoice, type D20Mode, MODIFIER, type Spend, SPENDS } from '@vtt/system-dnd5e';
import { type SyntheticEvent, useState } from 'react';
import { t } from '../i18n/index.ts';
import { paymentKey, type PaymentOption } from '../play/payments.ts';
import type { ExtraValue } from '../play/roll-extras.ts';
import { type RollPicked, type RollPlan, startingD20 } from '../play/roll-plan.ts';
import type { Session } from '../session/session.ts';
import { ORDINAL } from '../text/spell-text.ts';
import { Button } from './kit/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './kit/dialog.tsx';
import { Input } from './kit/input.tsx';
import { Label } from './kit/label.tsx';
import { SelectField } from './kit/select.tsx';
import { Switch } from './kit/switch.tsx';
import { ExtraPicks } from './RollExtras.tsx';
import { ToggleGroup, ToggleGroupItem } from './kit/toggle-group.tsx';

// The roll dialog (session-roll-dialog.ts): before an attack, a spell, a
// feature, a check or a save goes to the table, you pick what it spends of
// your turn, what pays for it, how the d20 is rolled (starting on how it
// would be rolled as things stand), a situational modifier, and the damage,
// and the action's own options (RollExtras.tsx), so nothing is asked before it.

/** What you have picked so far; the text fields as typed. */
interface Draft {
  d20?: D20Mode;
  crit?: CritChoice;
  spend?: Spend;
  payment?: string;
  situational: string;
  damageExtra: string;
  damageSet: string;
  /** The action's own picks that were changed, by id. */
  extras: Record<string, ExtraValue>;
}

const D20S: readonly D20Mode[] = ['advantage', 'normal', 'disadvantage'];
const AS_ROLLED = 'auto';
const SET = /^\d{1,4}$/;

const squeezed = (text: string) => text.replace(/\s+/g, '');
const modifierOk = (text: string) => !squeezed(text) || MODIFIER.test(squeezed(text));
const setOk = (text: string) => !text.trim() || SET.test(text.trim());

/** The picks as the session takes them. */
function pickedOf(plan: RollPlan, draft: Draft, standing: D20Mode | undefined): RollPicked {
  return {
    d20: draft.d20 ?? startingD20(plan, standing),
    crit: draft.crit,
    spend: draft.spend,
    payment: plan.payments?.find((p) => p.key === draft.payment),
    situational: squeezed(draft.situational),
    damageExtra: squeezed(draft.damageExtra),
    ...(draft.damageSet.trim() && { damageSet: Number(draft.damageSet) }),
    extras: draft.extras,
  };
}

export function RollDialog({ session }: Readonly<{ session: Session }>) {
  const { plan, shown } = session.actions.rolls;
  return plan ? <RollDialogWindow key={shown} session={session} plan={plan} /> : null;
}

type Props = Readonly<{ plan: RollPlan; draft: Draft; change: (next: Partial<Draft>) => void }>;

function RollDialogWindow({ session, plan }: Readonly<{ session: Session; plan: RollPlan }>) {
  const [draft, setDraft] = useState<Draft>({ situational: '', damageExtra: '', damageSet: '', extras: {} });
  const change = (next: Partial<Draft>) => setDraft((d) => ({ ...d, ...next }));
  const standing = session.actions.rolls.d20;
  const ok = modifierOk(draft.situational) && modifierOk(draft.damageExtra) && setOk(draft.damageSet);
  const confirm = (e: SyntheticEvent) => {
    e.preventDefault();
    if (ok) session.actions.rolls.confirm(pickedOf(plan, draft, standing));
  };
  const { kind, name, target } = plan.what;
  return (
    <Dialog open modal onOpenChange={(open) => !open && session.actions.rolls.cancel()}>
      <DialogContent data-slot="roll-dialog" aria-describedby={undefined}>
        <DialogTitle>{t(`rolls.title.${kind}`, { name })}</DialogTitle>
        {target && <DialogDescription>{t('rolls.at', { target })}</DialogDescription>}
        <form className="flex flex-col gap-3" onSubmit={confirm}>
          <ExtraPicks plan={plan} values={draft.extras} change={(extras) => change({ extras })} />
          {plan.spend && <SpendPick plan={plan} draft={draft} change={change} />}
          {plan.payments && <PaymentPick plan={plan} draft={draft} change={change} />}
          {plan.ask && <D20Pick plan={plan} draft={draft} change={change} standing={standing} />}
          {plan.damage && <DamagePick plan={plan} draft={draft} change={change} />}
          <div className="flex items-center gap-2 pt-1">
            <Label className="mr-auto font-body tracking-normal" title={t('rolls.askHint')}>
              <Switch
                checked={session.actions.rolls.enabled}
                onCheckedChange={(on) => session.actions.rolls.setEnabled(on)}
              />
              {t('rolls.ask')}
            </Label>
            <Button type="button" variant="ghost" size="sm" onClick={() => session.actions.rolls.cancel()}>
              {t('rolls.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!ok} autoFocus>
              {t(plan.ask ? 'rolls.roll' : 'rolls.go')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One titled part of the dialog. */
function Section({ title, hint, children }: Readonly<{ title: string; hint?: string; children: React.ReactNode }>) {
  return (
    <section className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-display text-sm text-gold">{title}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </section>
  );
}

/** What it spends of the turn: an action, a bonus action, the reaction, or nothing. */
function SpendPick({ plan, draft, change }: Props) {
  const usual = t(`rolls.spend.${plan.spend!}`);
  return (
    <Section title={t('rolls.spendTitle')} hint={t('rolls.usually', { what: usual })}>
      <ToggleGroup
        type="single"
        className="w-full"
        aria-label={t('rolls.spendTitle')}
        value={draft.spend ?? plan.spend}
        onValueChange={(v) => v && change({ spend: v as Spend })}
      >
        {SPENDS.map((s) => (
          <ToggleGroupItem key={s} value={s}>
            {t(`rolls.spend.${s}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Section>
  );
}

function paymentLabel(p: PaymentOption): string {
  if (p.free) return t('rolls.pay.free');
  if (p.paidBy) return p.left === undefined ? p.name! : t('rolls.pay.feature', { name: p.name!, left: p.left });
  return t('rolls.pay.slot', { level: ORDINAL[p.slot]!, left: p.left ?? 0 });
}

/** What pays for the cast: a slot of some level, a feature that casts it, or nothing. */
function PaymentPick({ plan, draft, change }: Props) {
  const now = plan.msg.t === 'cast' ? paymentKey(plan.msg) : '';
  return (
    <Section title={t('rolls.payTitle')}>
      <SelectField
        aria-label={t('rolls.payTitle')}
        value={draft.payment ?? now}
        onValueChange={(payment) => change({ payment })}
        options={plan.payments!.map((p) => ({ value: p.key, label: paymentLabel(p) }))}
      />
    </Section>
  );
}

/** How the d20 is rolled, starting on how it would be as things stand, and a modifier for the situation. */
function D20Pick({ plan, draft, change, standing }: Props & Readonly<{ standing: D20Mode | undefined }>) {
  const hint = standing ? t('rolls.standing', { mode: t(`rolls.d20.${standing}`) }) : t('rolls.checking');
  return (
    <Section title={t('rolls.d20Title')} hint={hint}>
      <ToggleGroup
        type="single"
        className="w-full"
        aria-label={t('rolls.d20Title')}
        value={draft.d20 ?? startingD20(plan, standing)}
        onValueChange={(v) => v && change({ d20: v as D20Mode })}
      >
        {D20S.map((mode) => (
          <ToggleGroupItem key={mode} value={mode}>
            {t(`rolls.d20.${mode}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Label className="font-body tracking-normal">
        <span className="w-28 shrink-0">{t('rolls.situational')}</span>
        <Input
          className="flex-1"
          value={draft.situational}
          placeholder={t('rolls.modifierHint')}
          aria-label={t('rolls.situational')}
          aria-invalid={!modifierOk(draft.situational)}
          onChange={(e) => change({ situational: e.target.value })}
        />
      </Label>
    </Section>
  );
}

/** The damage: a critical forced or held back, extra damage, or the number it deals, typed in. */
function DamagePick({ plan, draft, change }: Props) {
  return (
    <Section title={t('rolls.damageTitle')}>
      {plan.crit && (
        <ToggleGroup
          type="single"
          className="w-full"
          aria-label={t('pick.critLabel')}
          value={draft.crit ?? AS_ROLLED}
          onValueChange={(v) => v && change({ crit: v === AS_ROLLED ? undefined : (v as CritChoice) })}
        >
          <ToggleGroupItem value={AS_ROLLED}>{t('pick.asRolled')}</ToggleGroupItem>
          <ToggleGroupItem value="crit">{t('pick.crit')}</ToggleGroupItem>
          <ToggleGroupItem value="normal">{t('pick.noCrit')}</ToggleGroupItem>
        </ToggleGroup>
      )}
      <Label className="font-body tracking-normal">
        <span className="w-28 shrink-0">{t('rolls.damageExtra')}</span>
        <Input
          className="flex-1"
          value={draft.damageExtra}
          placeholder={t('rolls.modifierHint')}
          aria-label={t('rolls.damageExtra')}
          aria-invalid={!modifierOk(draft.damageExtra)}
          onChange={(e) => change({ damageExtra: e.target.value })}
        />
      </Label>
      <Label className="font-body tracking-normal">
        <span className="w-28 shrink-0">{t('rolls.damageSet')}</span>
        <Input
          className="flex-1"
          inputMode="numeric"
          value={draft.damageSet}
          placeholder={t('rolls.damageSetHint')}
          aria-label={t('rolls.damageSet')}
          aria-invalid={!setOk(draft.damageSet)}
          onChange={(e) => change({ damageSet: e.target.value })}
        />
      </Label>
    </Section>
  );
}

import {
  ABILITIES,
  type Ability,
  type ActorLevelPlan,
  abilityName,
  actorLevelPlan,
  characterLevel,
  classLevels,
  type Content,
  type Stats,
} from '@vtt/system-dnd5e';
import { useState } from 'react';
import { gameContent } from '../../content/content.ts';
import { t } from '../../i18n/index.ts';
import { Button } from '../kit/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../kit/dialog.tsx';
import { NumberField } from '../kit/number-field.tsx';
import { SelectField } from '../kit/select.tsx';
import { ToggleGroup, ToggleGroupItem } from '../kit/toggle-group.tsx';
import type { SheetProps } from './sheet-props.ts';

// The sheet's Level up for a character that is only an actor (imported from
// Foundry, made on its sheet): pick the class, how hit points are gained,
// the subclass and the ability score improvement when they are due. The
// server checks and applies it (level-actions.ts) and rolls the hit die.

type Bonus = Partial<Record<Ability, number>>;
type Hp = 'average' | 'roll';

/** The classes to take a level in: the ones it has first, then every other the game knows. */
function classOptions(stats: Stats | undefined, content: Content): { value: string; label: string }[] {
  const have = classLevels({ stats }, content).flatMap((l) => (l.cls ? [l.cls] : []));
  const rest = [...content.classes.values()].filter((c) => !have.some((h) => h.id === c.id));
  return [...have, ...rest.toSorted((a, b) => a.name.localeCompare(b.name))].map((c) => ({
    value: c.id,
    label: c.name,
  }));
}

const spent = (b: Bonus) => Object.values(b).reduce((n, v) => n + v, 0);

export function LevelUpDialog({
  session,
  kind,
  value,
  sheet,
  onClose,
}: Readonly<Pick<SheetProps, 'session' | 'kind' | 'value' | 'sheet'> & { onClose: () => void }>) {
  const content = gameContent(sheet.edition);
  const options = classOptions(value.stats, content);
  const [classId, setClassId] = useState(options[0]?.value ?? '');
  const [hp, setHp] = useState<Hp>('average');
  const [subclass, setSubclass] = useState('');
  const [bonus, setBonus] = useState<Bonus>({});
  const plan = actorLevelPlan(value.stats ?? {}, classId, content, sheet.edition);
  const pick = (id: string) => {
    setClassId(id);
    setSubclass('');
    setBonus({});
  };
  const ready = !plan.problem && (!plan.improvement || [0, 2].includes(spent(bonus)));
  const confirm = () => {
    session.requests.levelUp(levelUpRequest({ kind, id: value.id, plan }, { class: classId, hp, subclass, bonus }));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(520px,calc(100vw-32px))]" aria-label={t('levelUp.title', { name: value.name })}>
        <DialogTitle>{t('levelUp.title', { name: value.name })}</DialogTitle>
        <DialogDescription>
          {t('levelUp.reaches', { from: characterLevel(value.stats) ?? 0, to: plan.level })}
        </DialogDescription>
        <Row label={t('levelUp.class')}>
          <SelectField value={classId} aria-label={t('levelUp.class')} onValueChange={pick} options={options} />
        </Row>
        <HitPoints plan={plan} hp={hp} setHp={setHp} />
        <SubclassPick plan={plan} subclass={subclass} setSubclass={setSubclass} />
        {plan.improvement && <Improvement stats={value.stats} bonus={bonus} setBonus={setBonus} />}
        {plan.problem && <p className="text-sm text-destructive">{plan.problem}</p>}
        <p className="muted text-xs">{t('levelUp.spellsHint')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('levelUp.cancel')}
          </Button>
          <Button disabled={!ready} onClick={confirm}>
            {t('levelUp.confirm', { level: plan.level })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface Picked {
  class: string;
  hp: Hp;
  subclass: string;
  bonus: Bonus;
}

/** What the dialog asks the server for: the improvement only when all of it is spent. */
function levelUpRequest(
  to: { kind: SheetProps['kind']; id: string; plan: ActorLevelPlan },
  { class: cls, hp, subclass, bonus }: Picked,
): Parameters<SheetProps['session']['requests']['levelUp']>[0] {
  const improvement = to.plan.improvement && spent(bonus) === 2 ? bonus : undefined;
  return {
    ...(to.kind === 'token' ? { token: to.id } : { actor: to.id }),
    class: cls,
    hp,
    ...(subclass && { subclass }),
    ...(improvement && { improvement }),
  };
}

function SubclassPick({
  plan,
  subclass,
  setSubclass,
}: Readonly<{ plan: ActorLevelPlan; subclass: string; setSubclass: (id: string) => void }>) {
  if (!plan.subclasses.length) return null;
  return (
    <Row label={t('levelUp.subclass')}>
      <SelectField
        value={subclass}
        aria-label={t('levelUp.subclass')}
        placeholder={t('levelUp.subclassPick')}
        onValueChange={setSubclass}
        options={[
          { value: '', label: t('levelUp.subclassLater') },
          ...plan.subclasses.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />
    </Row>
  );
}

/** A label on the left, its control filling the rest. */
function Row({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-2">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function HitPoints({ plan, hp, setHp }: Readonly<{ plan: ActorLevelPlan; hp: Hp; setHp: (hp: Hp) => void }>) {
  return (
    <Row label={t('levelUp.hitPoints', { die: plan.hitDie })}>
      <ToggleGroup
        type="single"
        value={hp}
        onValueChange={(v) => v && setHp(v as Hp)}
        aria-label={t('levelUp.hitPointsHow')}
      >
        <ToggleGroupItem value="average">{t('levelUp.average', { n: plan.average })}</ToggleGroupItem>
        <ToggleGroupItem value="roll">{t('levelUp.roll', { die: plan.hitDie })}</ToggleGroupItem>
      </ToggleGroup>
    </Row>
  );
}

/** Two points over the scores, none above 20; or none, to take a feat on the sheet instead. */
function Improvement({
  stats,
  bonus,
  setBonus,
}: Readonly<{ stats: Stats | undefined; bonus: Bonus; setBonus: (b: Bonus) => void }>) {
  const left = 2 - spent(bonus);
  return (
    <fieldset className="flex flex-col gap-1.5" aria-label={t('levelUp.improvement')}>
      <legend className="text-sm">{t('levelUp.improvementLeft', { n: left })}</legend>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {ABILITIES.map((a) => {
          const score = stats?.abilities?.[a] ?? 10;
          const add = bonus[a] ?? 0;
          return (
            <label key={a} className="flex items-center justify-between gap-1 text-xs">
              <span className="min-w-0 flex-1 truncate" title={abilityName(a)}>
                {abilityName(a)} <strong className="text-gold-bright">{score + add}</strong>
              </span>
              <NumberField
                className="w-24 shrink-0"
                value={add}
                min={0}
                max={Math.min(2, add + left, 20 - score)}
                aria-label={t('levelUp.raise', { ability: abilityName(a) })}
                onValueChange={(n) => setBonus({ ...bonus, [a]: n })}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

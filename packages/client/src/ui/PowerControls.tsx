import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import type { Aiming } from '../play/targeting.ts';
import { costHint, togglePick } from '../play/power-aiming.ts';
import { Button } from './kit/button.tsx';
import { NumberField } from './kit/number-field.tsx';
import { Toggle } from './kit/toggle.tsx';

// While a pool feature is aimed (an illusionist's Weave or bolt): its options
// to pick (senses, shapes), the numbers to enter, what it costs, using it as
// a bonus action, and the button that uses it. With the roll dialog on
// only the button is here: the dialog asks the rest.

export function PowerControls({ session, aiming }: Readonly<{ session: Session; aiming: Aiming }>) {
  const feature = session.actions.aimedPower;
  const power = aiming.power;
  if (!feature || !power) return null;
  const change = (fn: Parameters<typeof session.actions.changePower>[0]) => session.actions.changePower(fn);
  const ready = aiming.mode !== 'creatures' || aiming.picks.length > 0;
  const use = ready && aiming.mode !== 'point' && (
    <Button size="sm" onClick={() => session.actions.confirmCast()}>
      {aiming.mode === 'creatures' ? t('power.useAt', { n: aiming.picks.length }) : t('power.use')}
    </Button>
  );
  if (session.actions.rolls.enabled) return use || null;
  return (
    <>
      {(feature.options ?? []).map((g) => (
        <span key={g.id} className="slot-choices" role="group" aria-label={g.name}>
          <span className="slot-choices-label">{g.name}</span>
          {g.list.map((o) => (
            <Toggle
              key={o.id}
              pressed={power.picks.includes(o.id)}
              title={o.note ?? o.name}
              onPressedChange={() => change((aim, f) => togglePick(aim, f, o.id))}
            >
              {o.name}
            </Toggle>
          ))}
        </span>
      ))}
      {(feature.inputs ?? []).map((i) => (
        <label key={i.id} className="flex items-center gap-1 text-sm">
          {i.name}
          <NumberField
            value={power.inputs[i.id] ?? i.default}
            min={i.min}
            aria-label={i.name}
            onValueChange={(n) => change((aim) => ({ ...aim, inputs: { ...aim.inputs, [i.id]: n } }))}
          />
        </label>
      ))}
      <span className="muted">{costHint(feature, power)}</span>
      {feature.action === 'action' && (
        <Toggle
          pressed={power.bonus}
          title={t('power.bonusTitle')}
          onPressedChange={(bonus) => change((aim) => ({ ...aim, bonus }))}
        >
          {t('power.bonus')}
        </Toggle>
      )}
      {use}
    </>
  );
}

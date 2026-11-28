import type { TokenView } from '@vtt/system-dnd5e';
import type { Session } from '../session/session.ts';
import { ORDINAL } from '../text/spell-text.ts';
import { Toggle } from './kit/toggle.tsx';
import { t } from '../i18n/index.ts';

/** While a melee attack is readied by a 2014 paladin: which slot, if any, to Divine Smite with on a hit (the roll dialog asks instead when it is on). */
export function SmiteControls({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const sheet = token.sheet;
  if (session.actions.rolls.enabled) return null;
  const attack = sheet?.attacks.find((a) => a.name === session.actions.armed);
  const caster = sheet?.caster;
  if (attack?.kind !== 'melee' || !caster || !sheet.features.some((f) => f.id === 'divine-smite')) return null;
  const levels = caster.left.flatMap((left, i) => (left > 0 ? [i + 1] : []));
  if (!levels.length) return null;
  return (
    <div className="aiming frame">
      <span className="aiming-name">{t('smite.name')}</span>
      <span className="slot-choices" role="group" aria-label={t('smite.slot')}>
        {levels.map((level) => (
          <Toggle
            key={level}
            pressed={session.actions.smite === level}
            onPressedChange={(on) => session.actions.setSmite(on ? level : undefined)}
            title={t('smite.title', { level: ORDINAL[level] ?? level })}
          >
            {ORDINAL[level]}
            <span className="slot-chip-left">{`${caster.left[level - 1]}/${caster.slots[level - 1]}`}</span>
          </Toggle>
        ))}
      </span>
    </div>
  );
}

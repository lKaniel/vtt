import type { TokenView } from '@vtt/shared';
import type { Session } from '../session.ts';
import { ORDINAL } from '../spell-text.ts';

/** While a melee attack is readied by a 2014 paladin: which slot, if any, to Divine Smite with on a hit. */
export function SmiteControls({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const sheet = token.sheet;
  const attack = sheet?.attacks.find((a) => a.name === session.armed);
  const caster = sheet?.caster;
  if (attack?.kind !== 'melee' || !caster || !sheet.features.some((f) => f.id === 'divine-smite')) return null;
  const levels = caster.left.flatMap((left, i) => (left > 0 ? [i + 1] : []));
  if (!levels.length) return null;
  return (
    <div className="aiming frame">
      <span className="aiming-name">Divine Smite</span>
      <span className="slot-choices" role="group" aria-label="Smite slot">
        {levels.map((level) => (
          <button
            key={level}
            className={session.smite === level ? 'chip slot-chip on' : 'chip slot-chip'}
            onClick={() => session.setSmite(session.smite === level ? undefined : level)}
            title={`On a hit, spend a ${ORDINAL[level]}-level slot for radiant damage`}
          >
            {ORDINAL[level]}
            <span className="slot-chip-left">{`${caster.left[level - 1]}/${caster.slots[level - 1]}`}</span>
          </button>
        ))}
      </span>
    </div>
  );
}

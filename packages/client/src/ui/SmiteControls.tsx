import type { TokenView } from '@vtt/system-dnd5e';
import type { Session } from '../session.ts';
import { ORDINAL } from '../spell-text.ts';
import { Toggle } from './kit/toggle.tsx';

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
          <Toggle
            key={level}
            pressed={session.smite === level}
            onPressedChange={(on) => session.setSmite(on ? level : undefined)}
            title={`On a hit, spend a ${ORDINAL[level]}-level slot for radiant damage`}
          >
            {ORDINAL[level]}
            <span className="slot-chip-left">{`${caster.left[level - 1]}/${caster.slots[level - 1]}`}</span>
          </Toggle>
        ))}
      </span>
    </div>
  );
}

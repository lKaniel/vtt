import { hitFinishers, momentumDice, type TokenView } from '@vtt/system-dnd5e';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Toggle } from './kit/toggle.tsx';

/** While an attack is readied by a creature holding momentum dice: the finisher, if any, to spend them on a hit. */
export function FinisherControls({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const sheet = token.sheet;
  const pool = sheet && momentumDice(sheet);
  const finishers = sheet ? hitFinishers(sheet) : [];
  if (!session.actions.armed || !pool?.dice || !finishers.length) return null;
  return (
    <div className="aiming frame" data-slot="finisher-controls">
      <span className="aiming-name">{t('finisher.label')}</span>
      <span className="muted">{t('finisher.dice', { dice: String(pool.dice), die: String(pool.die) })}</span>
      <span className="slot-choices" role="group" aria-label={t('finisher.label')}>
        {finishers.map((f) => (
          <Toggle
            key={f.id}
            pressed={session.actions.finisher === f.id}
            onPressedChange={(on) => session.actions.setFinisher(on ? f.id : undefined)}
            title={t('finisher.hint', { name: f.name })}
          >
            {f.name}
          </Toggle>
        ))}
      </span>
    </div>
  );
}

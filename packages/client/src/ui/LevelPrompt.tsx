import type { Session } from '../session/session.ts';
import { t } from '../i18n/index.ts';
import { Button } from './kit/button.tsx';

/** An elevator asks where the creature you moved into it goes. */
export function LevelPrompt({ session }: Readonly<{ session: Session }>) {
  const choice = session.levels.choice;
  if (!choice) return null;
  const name = session.tokens.get(choice.token)?.name ?? '';
  return (
    <div className="aiming frame reaction-prompt" role="dialog" aria-label={t('levels.question', { name })}>
      <span className="aiming-name">{t('levels.question', { name })}</span>
      <span className="slot-choices">
        {choice.levels.map((level) => (
          <Button key={level.id} variant="outline" size="sm" onClick={() => session.levels.pick(level.id)}>
            {level.name}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={() => session.levels.dismiss()}>
          {t('levels.stay')}
        </Button>
      </span>
    </div>
  );
}

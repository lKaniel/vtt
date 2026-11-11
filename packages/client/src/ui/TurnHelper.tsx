import { SwordsIcon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import { type Shown, takeAdvice, turnAdvice } from '../play/turn-advice.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';

// The GM's turn helper in the turn order bar: on a monster's turn, its best
// attack and target on one button. Nothing happens until the GM clicks it.

function hint({ mover, target, advice }: Shown): string {
  return t(advice.drops ? 'helper.hintDrops' : 'helper.hint', {
    name: mover.name,
    target: target.name,
    chance: Math.round(advice.hitChance * 100),
    damage: Math.round(advice.expected),
  });
}

export function TurnHelper({ session }: Readonly<{ session: Session }>) {
  const shown = turnAdvice(session);
  if (!shown) return null;
  const words = { attack: shown.advice.attack, target: shown.target.name };
  return (
    <Button
      variant="outline"
      size="sm"
      data-slot="turn-helper"
      title={hint(shown)}
      onClick={() => takeAdvice(session, shown)}
    >
      <SwordsIcon /> {t(shown.advice.walks ? 'helper.walk' : 'helper.suggest', words)}
    </Button>
  );
}

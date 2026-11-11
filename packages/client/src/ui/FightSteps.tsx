import { SkipBackIcon, SkipForwardIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { NumberField } from './kit/number-field.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { Pressable } from './kit/pressable.tsx';

// The GM's hand on the fight as a whole, in the turn order bar: the round
// badge opens the round to set, and two buttons step the turn back or on.

type Props = Readonly<{ session: Session }>;

/** The round (or "Turns" in turn-based mode); the GM clicks it to set the number. */
export function RoundBadge({ session }: Props) {
  const combat = session.combat!;
  const peaceful = combat.peaceful === true;
  const badge = (
    <>
      <span className="round-label">{peaceful ? 'Turns' : 'Round'}</span>
      <span className="round-number">{combat.round}</span>
    </>
  );
  const title = peaceful ? 'Turn-based mode: 6 seconds a round' : 'Round';
  if (!session.isGm()) {
    return (
      <span className="round" title={title}>
        {badge}
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Pressable className="round" title={t('fight.editRound')} aria-label={t('fight.editRound')}>
          {badge}
        </Pressable>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[200px]" data-slot="round-edit">
        <RoundForm key={combat.round} session={session} round={combat.round} />
      </PopoverContent>
    </Popover>
  );
}

function RoundForm({ session, round }: Props & Readonly<{ round: number }>) {
  const [value, setValue] = useState(round);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value !== round) session.hud.setRound(Math.max(1, Math.round(value)));
      }}
    >
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
        {t('fight.round')}
        <NumberField value={value} onValueChange={setValue} min={1} max={9999} aria-label={t('fight.round')} />
      </label>
      <Button type="submit" size="sm">
        {t('fight.setRound')}
      </Button>
    </form>
  );
}

/** GM: back to the turn before, or on to the next (the turn ends for everyone taking it). */
export function TurnSteps({ session }: Props) {
  return (
    <span className="flex flex-none flex-col gap-1" data-slot="turn-steps">
      <Button
        variant="outline"
        size="icon-sm"
        title={t('fight.nextTurn')}
        aria-label={t('fight.nextTurn')}
        onClick={() => session.hud.passTurn()}
      >
        <SkipForwardIcon />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        title={t('fight.previousTurn')}
        aria-label={t('fight.previousTurn')}
        onClick={() => session.hud.turnBack()}
      >
        <SkipBackIcon />
      </Button>
    </span>
  );
}

import { actsNow, currentTurn, type TokenView } from '@vtt/system-dnd5e';
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon, RotateCcwIcon, SquareIcon, UserMinusIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { NumberField } from './kit/number-field.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { Separator } from './kit/separator.tsx';
import { TurnOverrideFields } from './TurnOverrideControls.tsx';

// The menu on a portrait in the turn order, opened from its initiative badge
// or by a right click, for whoever may bend that creature's turns: its
// initiative set by hand, what its turn has left, and for the GM the whole
// fight by hand: the turn given to it now (or started over), its turn ended
// for it, its place in the order, and the creature taken out of the fight.

type Props = Readonly<{ session: Session; token: TokenView; initiative: number }>;
type MenuProps = Props & Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>;

export function TurnMenu({ session, token, initiative, open, onOpenChange }: MenuProps) {
  const name = token.name;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-slot="initiative-badge"
          className="absolute -top-1.5 -right-1.5 z-10 h-5 min-w-5 rounded-full px-1 text-[10px] leading-none"
          title={t('fight.editInitiative', { name })}
          aria-label={t('fight.editInitiative', { name })}
        >
          {initiative}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="flex w-[270px] flex-col gap-2" data-slot="initiative-edit">
        <span className="font-display text-sm text-gold">{t('fight.menuOf', { name })}</span>
        <InitiativeForm key={initiative} session={session} token={token} initiative={initiative} />
        {session.isGm() && <GmControls session={session} token={token} close={() => onOpenChange(false)} />}
        {session.hud.turnOf(token.id) && (
          <>
            <Separator />
            <TurnOverrideFields session={session} token={token} />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The number, and Set: the creature moves to its new place in the order. */
function InitiativeForm({ session, token, initiative }: Props) {
  const [value, setValue] = useState(initiative);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value !== initiative) session.hud.setInitiative(token.id, value);
      }}
    >
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
        {t('fight.initiative')}
        <NumberField value={value} onValueChange={setValue} min={-99} max={99} aria-label={t('fight.initiative')} />
      </label>
      <Button type="submit" size="sm">
        {t('fight.setInitiative')}
      </Button>
    </form>
  );
}

type GmProps = Readonly<{ session: Session; token: TokenView; close: () => void }>;

/** GM: the turn given to this creature, ended for it, its place in the order, and out of the fight. */
function GmControls({ session, token, close }: GmProps) {
  const combat = session.combat;
  if (!combat) return null;
  const name = token.name;
  const has = currentTurn(combat) === token.id;
  const at = combat.order.findIndex((e) => e.token === token.id);
  const then = (act: () => void) => () => {
    act();
    close();
  };
  return (
    <div className="flex flex-col gap-1.5" data-slot="turn-gm-controls">
      <Button
        variant="outline"
        size="sm"
        title={t(has ? 'fight.restartTurnHint' : 'fight.takeTurnHint', { name })}
        onClick={then(() => session.hud.giveTurn(token.id))}
      >
        {has ? <RotateCcwIcon /> : <PlayIcon />} {t(has ? 'fight.restartTurn' : 'fight.takeTurn')}
      </Button>
      {actsNow(combat, token.id) && (
        <Button
          variant="outline"
          size="sm"
          title={t('fight.endTurnHint', { name })}
          onClick={then(() => session.requests.endTurn(token.id))}
        >
          <SquareIcon /> {t('fight.endTurnOf')}
        </Button>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {t('fight.order')}
        <span className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={at <= 0}
            title={t('fight.earlier', { name })}
            aria-label={t('fight.earlier', { name })}
            onClick={() => session.hud.moveInOrder(token.id, -1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={at >= combat.order.length - 1}
            title={t('fight.later', { name })}
            aria-label={t('fight.later', { name })}
            onClick={() => session.hud.moveInOrder(token.id, 1)}
          >
            <ChevronRightIcon />
          </Button>
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={then(() => session.hud.setCombatant(token.id, false))}>
        <UserMinusIcon /> {t('fight.remove')}
      </Button>
    </div>
  );
}

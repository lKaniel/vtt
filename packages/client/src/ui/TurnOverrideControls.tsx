import type { TokenView, TurnBudget } from '@vtt/system-dnd5e';
import { SlidersHorizontalIcon } from 'lucide-react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import type { TurnOverride } from '../session/session-hud.ts';
import { Button } from './kit/button.tsx';
import { NumberField } from './kit/number-field.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';
import { Toggle } from './kit/toggle.tsx';

// The action bar's Override button, for the GM and trusted players on what
// they control while it is in a fight: give back (or take away) its action,
// bonus action and reaction, and set or add to its movement, past what the
// rules would allow (a DM's ruling, a feature the table doesn't know). The
// server checks who may and says so in the log (hud-actions.ts).

type Props = Readonly<{ session: Session; token: TokenView }>;

export function TurnOverrideButton({ session, token }: Props) {
  const turn = session.hud.turnOf(token.id);
  if (!turn || !session.hud.canOverride(token.id)) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" title={t('override.title')}>
          <SlidersHorizontalIcon />
          {t('override.button')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-[260px] flex-col gap-2" data-slot="turn-override">
        <span className="font-display text-sm text-gold">{t('override.heading', { name: token.name })}</span>
        <Budget session={session} token={token} budget={turn.budget} />
        <Toggle
          variant="plate"
          pressed={turn.reaction}
          onPressedChange={(reaction) => session.hud.overrideTurn(token.id, { reaction })}
        >
          {t('override.reaction')}
        </Toggle>
        <p className="text-xs text-muted-foreground">{t('override.hint')}</p>
      </PopoverContent>
    </Popover>
  );
}

/** The action, bonus action and movement: only while the creature acts. */
function Budget({ session, token, budget }: Props & Readonly<{ budget: TurnBudget | undefined }>) {
  if (!budget) return <p className="text-xs text-muted-foreground">{t('override.notTurn')}</p>;
  const set = (change: TurnOverride) => session.hud.overrideTurn(token.id, change);
  const speed = token.sheet?.speed ?? token.speed;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Toggle variant="plate" pressed={budget.action} onPressedChange={(action) => set({ action })}>
          {t('override.action')}
        </Toggle>
        <Toggle variant="plate" pressed={budget.bonus} onPressedChange={(bonus) => set({ bonus })}>
          {t('override.bonus')}
        </Toggle>
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          {t('override.move')}
          <NumberField
            aria-label={t('override.move')}
            value={budget.move}
            min={0}
            step={5}
            onValueChange={(move) => set({ move: Math.max(0, Math.round(move)) })}
          />
        </label>
        <Button
          variant="outline"
          size="sm"
          title={t('override.dashTitle')}
          onClick={() => set({ move: budget.move + speed })}
        >
          {t('override.dash', { feet: speed })}
        </Button>
      </div>
    </>
  );
}

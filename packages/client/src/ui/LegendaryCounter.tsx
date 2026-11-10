import type { Creature } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';

// The GM's legendary-action counter on a legendary creature's portrait in the
// turn order: how many are left this round, and a click spends one on an
// option (at the one targeted creature, or around the creature itself).

type Props = Readonly<{ session: Session; token: string; name: string; legendary: NonNullable<Creature['legendary']> }>;

export function LegendaryCounter({ session, token, name, legendary }: Props) {
  const [open, setOpen] = useState(false);
  const spend = (option: string) => {
    session.requests.legendary(token, option, session.targets.only());
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-slot="legendary-counter"
          className="absolute -bottom-1.5 -left-1.5 z-10 h-5 min-w-5 rounded-full px-1 text-[10px] leading-none"
          title={t('fight.legendaryLeft', { name, left: legendary.left, total: legendary.actions })}
          aria-label={t('fight.legendaryLeft', { name, left: legendary.left, total: legendary.actions })}
        >
          ◆{legendary.left}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="flex w-[240px] flex-col gap-1 p-1.5" data-slot="legendary-options">
        <span className="font-display text-sm text-gold">
          {t('fight.legendaryOf', { name, left: legendary.left, total: legendary.actions })}
        </span>
        {legendary.options.map((o) => (
          <Button
            key={o.id}
            variant="ghost"
            className="justify-between"
            disabled={o.cost > legendary.left}
            title={o.description ?? o.name}
            onClick={() => spend(o.id)}
          >
            <span>{o.name}</span>
            {o.cost > 1 && (
              <span className="text-xs text-muted-foreground">{t('fight.legendaryCost', { n: o.cost })}</span>
            )}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

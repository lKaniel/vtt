import { useState } from 'react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { NumberField } from './kit/number-field.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';

// The GM's initiative badge on a portrait in the turn order: click it to set
// the number by hand (a mistyped roll, a held action); the order re-sorts.

type Props = Readonly<{ session: Session; token: string; name: string; initiative: number }>;

export function InitiativeEdit({ session, token, name, initiative }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initiative);
  const save = () => {
    if (value !== initiative) session.hud.setInitiative(token, value);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(on) => {
        if (on) setValue(initiative);
        setOpen(on);
      }}
    >
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
      <PopoverContent align="center" className="flex w-[200px] flex-col gap-2" data-slot="initiative-edit">
        <span className="font-display text-sm text-gold">{t('fight.initiativeOf', { name })}</span>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <NumberField
            value={value}
            onValueChange={setValue}
            min={-99}
            max={99}
            aria-label={t('fight.initiative')}
            autoFocus
          />
          <Button type="submit">{t('fight.setInitiative')}</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

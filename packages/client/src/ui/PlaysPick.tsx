import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import type { Player } from '@vtt/shared';
import { t } from '../i18n/index.ts';
import { type PlaysChoice, playsChoices } from '../play/plays.ts';
import type { Session } from '../session/session.ts';
import { Button } from './kit/button.tsx';
import { Checkbox } from './kit/checkbox.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';

/** GM: the creatures a seat plays, ticked on and off; each tick gives or takes the creature at once. */
export function PlaysPick({ session, player }: Readonly<{ session: Session; player: Player }>) {
  const [others, setOthers] = useState(false);
  const choices = playsChoices(player, session.actors.values());
  const toggle = (id: string, on: boolean) => session.requests.setPlays(player.id, id, on);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-[220px] justify-between"
          aria-label={t('players.characterOf', { name: player.name })}
          title={t('players.characterHint')}
        >
          <span className="truncate">{choices.names.join(', ') || t('players.noCharacter')}</span>
          <ChevronDownIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[260px] flex-col gap-2" data-slot="plays-pick">
        <span className="text-xs text-muted-foreground">{t('players.characterHint')}</span>
        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          <PlaysList title={t('players.characters')} list={choices.characters} onToggle={toggle} />
          <PlaysList
            title={t('players.creatures')}
            list={others ? choices.others : choices.others.filter((c) => c.plays)}
            onToggle={toggle}
          />
        </div>
        {!others && choices.others.some((c) => !c.plays) && (
          <Button variant="outline" size="sm" onClick={() => setOthers(true)}>
            {t('players.showCreatures')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

type ListProps = Readonly<{ title: string; list: readonly PlaysChoice[]; onToggle: (id: string, on: boolean) => void }>;

function PlaysList({ title, list, onToggle }: ListProps) {
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{title}</span>
      {list.map((c) => (
        <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={c.plays} aria-label={c.name} onCheckedChange={(on) => onToggle(c.id, on === true)} />
          <span className="truncate">{c.name}</span>
          {c.main && <span className="ml-auto text-xs text-muted-foreground">{t('players.main')}</span>}
        </label>
      ))}
    </div>
  );
}

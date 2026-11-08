import { isGm, isParty } from '@vtt/shared';
import { CheckIcon, CircleIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import { type ReadyKey, readySteps, type TableCounts, tableReady } from '../play/table-ready.ts';
import { readPref, writePref } from '../prefs.ts';
import type { Session } from '../session/session.ts';
import type { Tab } from './panel-tabs.ts';
import { Button } from './kit/button.tsx';
import { Window } from './kit/window.tsx';
import type { Size } from './kit/window-stack.ts';

// The GM's getting-ready card on a table that isn't set for a fight yet: a
// map, the players' characters, creatures to fight, then Start combat. Each
// step opens the side panel tab that does it. Only on the scene the players
// are on; hidden for good per scene.

/** The side panel tab each step is done from. */
const GO: Record<ReadyKey, Tab> = { map: 'Scenes', heroes: 'Players', foes: 'Compendium' };

/** Right of the party portraits, clear of the map's middle where new creatures arrive. */
const place = (view: Size) => ({ x: Math.min(190, Math.max(8, view.width - 336 - 328)), y: 120 });

function counts(session: Session): TableCounts {
  const tokens = [...session.tokens.values()];
  const party = tokens.filter(isParty).length;
  return {
    tiles: session.docs.all(`${session.scene}/tiles`).length,
    party,
    seats: session.players.filter((p) => !isGm(p)).length,
    foes: tokens.length - party,
  };
}

/** The words of a step: the heroes' line counts them. */
function stepText(key: ReadyKey, c: TableCounts): string {
  if (key === 'heroes') return c.seats ? t('ready.heroes', { n: c.party, of: c.seats }) : t('ready.heroesNone');
  return t(`ready.${key}`);
}

export function TableReady({ session }: Readonly<{ session: Session }>) {
  const pref = `ready-hidden:${session.gameId ?? ''}:${session.scene}`;
  const [hidden, setHidden] = useState(() => readPref(pref, ['yes'], 'no') === 'yes');
  const you = session.you;
  // Only the scene the players are on: scenes the GM is building on their own are left alone.
  const shown = session.scene && session.scene === session.scenes.active;
  if (!you || !isGm(you) || !shown || session.combat || hidden) return null;
  const c = counts(session);
  if (tableReady(c)) return null;
  const hide = () => {
    writePref(pref, 'yes');
    setHidden(true);
  };
  return (
    <Window
      id="table-ready"
      kind="table-ready"
      initial={place}
      title={t('ready.title')}
      onClose={hide}
      closeLabel={t('ready.dismiss')}
      className="w-[320px]"
      bodyClassName="flex flex-col gap-2 px-3 py-2"
    >
      <p className="text-sm text-muted-foreground">{t('ready.hint')}</p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={t('ready.title')}>
        {readySteps(c).map((s) => (
          <li key={s.key} className="flex items-center gap-2" data-done={s.done || undefined}>
            {s.done ? (
              <CheckIcon className="size-4 shrink-0 text-gold-bright" aria-label={t('ready.done')} />
            ) : (
              <CircleIcon className="size-3 shrink-0 text-muted-foreground" />
            )}
            <span className="flex-1 text-sm">{stepText(s.key, c)}</span>
            <Button variant="outline" size="sm" onClick={() => session.showPanel(GO[s.key])}>
              {t(`ready.${s.key}Go`)}
            </Button>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <CircleIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-sm">{t('ready.fight')}</span>
        </li>
      </ul>
    </Window>
  );
}

import { actsNow, currentTurn, isLairTurn } from '@vtt/system-dnd5e';
import { isParty } from '@vtt/shared';
import { HourglassIcon, MoonIcon, SwordsIcon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Face, HpBar } from './Portrait.tsx';
import { Button } from './kit/button.tsx';
import { EncounterButton } from './EncounterPanel.tsx';
import { RequestCheckButton } from './RequestCheck.tsx';
import { Toggle } from './kit/toggle.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';

const SHARED_KEY = 'vtt.sharedTurns';

/** The GM's choice of shared party turns, kept in this browser (on unless turned off). */
function loadShared(): boolean {
  try {
    return localStorage.getItem(SHARED_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveShared(on: boolean): void {
  try {
    localStorage.setItem(SHARED_KEY, on ? 'on' : 'off');
  } catch {
    // Private windows may refuse storage; the choice lasts until reload.
  }
}

/** Initiative order across the top of the screen, plus the GM's fight controls. */
type StartProps = Readonly<{ session: Session; onStart: (shared: boolean) => void }>;

export function TurnOrder({ session, onStart }: StartProps) {
  const combat = session.combat;
  const gm = session.isGm();
  if (!combat) return gm ? <IdleBar session={session} onStart={onStart} /> : null;
  const current = currentTurn(combat);
  const peaceful = combat.peaceful === true;
  return (
    <div className={`turn-order${peaceful ? ' peaceful' : ''}`}>
      <span className="round" title={peaceful ? 'Turn-based mode: 6 seconds a round' : 'Round'}>
        <span className="round-label">{peaceful ? 'Turns' : 'Round'}</span>
        <span className="round-number">{combat.round}</span>
      </span>
      <div className="turns">
        {combat.order.map((e) => {
          if (isLairTurn(e.token)) return <LairTurn key={e.token} current={e.token === current} />;
          const t = session.tokens.get(e.token);
          if (!t) return null;
          const down = (t.sheet?.hp ?? 1) <= 0 || t.health === 'down';
          const ally = isParty(t);
          const now = actsNow(combat, e.token);
          const ended = combat.done?.includes(e.token);
          const cls = ['turn', now && 'current', (down || ended) && 'down', ally ? 'ally' : 'foe'];
          return (
            <button
              key={e.token}
              className={cls.filter(Boolean).join(' ')}
              title={`${t.name}: initiative ${e.initiative}`}
              onClick={() => session.focus([t.x, t.y])}
            >
              <Face token={t} />
              <HpBar token={t} showLabel={false} />
            </button>
          );
        })}
      </div>
      {gm && peaceful && (
        <Button variant="outline" size="sm" onClick={() => session.requests.setTurnBased(false)}>
          Real time
        </Button>
      )}
      {gm && !peaceful && (
        <Button variant="outline" size="sm" onClick={() => session.requests.endCombat()}>
          End combat
        </Button>
      )}
    </div>
  );
}

/** The lair's turn on initiative 20. */
function LairTurn({ current }: Readonly<{ current: boolean }>) {
  return (
    <span
      className={`turn foe grid place-items-center font-display text-xs text-gold ${current ? 'current' : ''}`}
      title="Lair actions: initiative 20"
    >
      Lair
    </span>
  );
}

/** GM: the whole party takes a short or long rest, from one menu. */
function RestButton({ session }: Readonly<{ session: Session }>) {
  const [open, setOpen] = useState(false);
  const rest = (kind: 'short' | 'long') => {
    const party = [...session.tokens.values()].filter((t) => isParty(t) && t.sheet).map((t) => t.id);
    session.requests.rest(party, kind);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={t('fight.restHint')}>
          <MoonIcon /> {t('fight.rest')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[260px] flex-col gap-1 p-1.5">
        {(['short', 'long'] as const).map((kind) => (
          <Button
            key={kind}
            variant="ghost"
            className="h-auto flex-col items-start gap-0 py-1.5 text-left"
            onClick={() => rest(kind)}
          >
            <span>{t(kind === 'short' ? 'fight.shortRest' : 'fight.longRest')}</span>
            <span className="text-xs font-normal normal-case tracking-normal text-muted-foreground whitespace-normal">
              {t(kind === 'short' ? 'fight.shortRestHint' : 'fight.longRestHint')}
            </span>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** The GM's controls between fights: start one (shared party turns or not), turn-based mode, rests, encounters, checks. */
function IdleBar({ session, onStart }: StartProps) {
  const [shared, setShared] = useState(loadShared);
  return (
    <div className="turn-order idle flex-wrap justify-center">
      <span className="flex">
        <Button onClick={() => onStart(shared)} title={t('fight.startHint')}>
          <SwordsIcon /> {t('fight.start')}
        </Button>
        <Toggle
          variant="plate"
          className="-ml-px w-8 px-0"
          pressed={shared}
          onPressedChange={(on) => {
            setShared(on);
            saveShared(on);
          }}
          title={t('fight.sharedHint')}
          aria-label={t('fight.shared')}
        >
          <UsersIcon />
        </Toggle>
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => session.requests.setTurnBased(true)}
        title={t('fight.turnBasedHint')}
      >
        <HourglassIcon /> {t('fight.turnBased')}
      </Button>
      <RestButton session={session} />
      <EncounterButton session={session} />
      <RequestCheckButton session={session} />
    </div>
  );
}

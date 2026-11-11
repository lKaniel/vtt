import { actsNow, currentTurn, isLairTurn, type TokenView } from '@vtt/system-dnd5e';
import { isParty } from '@vtt/shared';
import { MoonIcon } from 'lucide-react';
import { useState } from 'react';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { Face, HpBar } from './Portrait.tsx';
import { InitiativeEdit } from './InitiativeEdit.tsx';
import { LegendaryCounter } from './LegendaryCounter.tsx';
import { Button } from './kit/button.tsx';
import { EncounterButton } from './EncounterPanel.tsx';
import { RequestCheckButton } from './RequestCheck.tsx';
import { AddFighters, StartCombat, StartTurns } from './StartCombat.tsx';
import { TurnHelper } from './TurnHelper.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './kit/popover.tsx';

/** Initiative order across the top of the screen, plus the GM's fight controls. */
export function TurnOrder({ session }: Readonly<{ session: Session }>) {
  const combat = session.combat;
  const gm = session.isGm();
  if (!combat) return gm ? <IdleBar session={session} /> : null;
  const current = currentTurn(combat);
  const peaceful = combat.peaceful === true;
  return (
    <div className={`turn-order${peaceful ? ' peaceful' : ''}`}>
      <span className="round" title={peaceful ? 'Turn-based mode: 6 seconds a round' : 'Round'}>
        <span className="round-label">{peaceful ? 'Turns' : 'Round'}</span>
        <span className="round-number">{combat.round}</span>
      </span>
      <div className="turns">
        {combat.order.map((e) =>
          isLairTurn(e.token) ? (
            <LairTurn key={e.token} current={e.token === current} />
          ) : (
            <Turn key={e.token} session={session} entry={e} />
          ),
        )}
      </div>
      {gm && <TurnHelper session={session} />}
      {gm && <AddFighters session={session} />}
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

type TurnProps = Readonly<{ session: Session; entry: { token: string; initiative: number } }>;

/** One creature's portrait in the order: click it to look at the creature. */
function Portrait({ session, entry: e, token: t }: TurnProps & Readonly<{ token: TokenView }>) {
  const combat = session.combat!;
  const down = (t.sheet?.hp ?? 1) <= 0 || t.health === 'down';
  const ended = combat.done?.includes(e.token);
  const cls = ['turn', actsNow(combat, e.token) && 'current', (down || ended) && 'down', isParty(t) ? 'ally' : 'foe'];
  return (
    <button
      className={cls.filter(Boolean).join(' ')}
      title={`${t.name}: initiative ${e.initiative}`}
      aria-label={`${t.name}: initiative ${e.initiative}`}
      onClick={() => session.focus([t.x, t.y])}
    >
      <Face token={t} />
      <HpBar token={t} showLabel={false} />
      <span className="turn-name">{t.name}</span>
    </button>
  );
}

/** A creature in the order, with the GM's initiative badge and legendary counter. */
function Turn({ session, entry: e }: TurnProps) {
  const t = session.tokens.get(e.token);
  if (!t) return null;
  const turn = <Portrait session={session} entry={e} token={t} />;
  const edit = session.hud.canOverride(e.token);
  const legendary = session.isGm() ? t.sheet?.legendary : undefined;
  if (!edit && !legendary) return turn;
  return (
    <span className="relative flex">
      {turn}
      {edit && <InitiativeEdit session={session} token={e.token} name={t.name} initiative={e.initiative} />}
      {legendary && <LegendaryCounter session={session} token={e.token} name={t.name} legendary={legendary} />}
    </span>
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
function IdleBar({ session }: Readonly<{ session: Session }>) {
  return (
    <div className="turn-order idle flex-wrap justify-center">
      <StartCombat session={session} />
      <StartTurns session={session} />
      <RestButton session={session} />
      <EncounterButton session={session} />
      <RequestCheckButton session={session} />
    </div>
  );
}

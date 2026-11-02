import { actsNow, currentTurn, isLairTurn } from '@vtt/system-dnd5e';
import { isParty } from '@vtt/shared';
import { useState } from 'react';
import type { Session } from '../session.ts';
import { Face, HpBar } from './Portrait.tsx';
import { Button } from './kit/button.tsx';
import { EncounterButton } from './EncounterPanel.tsx';
import { Toggle } from './kit/toggle.tsx';

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
        <Button variant="outline" size="sm" onClick={() => session.setTurnBased(false)}>
          Real time
        </Button>
      )}
      {gm && !peaceful && (
        <Button variant="outline" size="sm" onClick={() => session.endCombat()}>
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

/** GM: the whole party takes a short or long rest. */
function RestButtons({ session }: Readonly<{ session: Session }>) {
  const party = () => [...session.tokens.values()].filter((t) => isParty(t) && t.sheet).map((t) => t.id);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        title="Party takes a short rest"
        onClick={() => session.rest(party(), 'short')}
      >
        Short rest
      </Button>
      <Button variant="outline" size="sm" title="Party takes a long rest" onClick={() => session.rest(party(), 'long')}>
        Long rest
      </Button>
    </>
  );
}

/** The GM's controls between fights: start one (shared party turns or not), turn-based mode, rests. */
function IdleBar({ session, onStart }: StartProps) {
  const [shared, setShared] = useState(loadShared);
  return (
    <div className="turn-order idle">
      <Button
        variant="outline"
        onClick={() => onStart(shared)}
        title="Roll initiative for every creature with stats on screen"
      >
        Start combat
      </Button>
      <Toggle
        variant="plate"
        pressed={shared}
        onPressedChange={(on) => {
          setShared(on);
          saveShared(on);
        }}
        title="Shared party turns (BG3): party members next to each other in the order act together, in any order"
      >
        Party acts together
      </Toggle>
      <Button
        variant="outline"
        size="sm"
        onClick={() => session.setTurnBased(true)}
        title="Turn-based mode: the party takes turns, 6 seconds a round"
      >
        Turn-based
      </Button>
      <RestButtons session={session} />
      <EncounterButton session={session} />
    </div>
  );
}

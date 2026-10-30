import { currentTurn } from '@vtt/shared';
import type { Session } from '../session.ts';

/** Initiative order across the top of the screen, plus the GM's fight controls. */
export function TurnOrder({ session, onStart }: Readonly<{ session: Session; onStart: () => void }>) {
  const combat = session.combat;
  const gm = session.you?.role === 'gm';
  if (!combat) {
    return gm ? (
      <div className="turn-order">
        <button onClick={onStart} title="Roll initiative for every creature with stats on screen">
          Start combat
        </button>
        <RestButtons session={session} />
      </div>
    ) : null;
  }
  const current = currentTurn(combat);
  return (
    <div className="turn-order">
      <span className="round">Round {combat.round}</span>
      {combat.order.map((e) => {
        const t = session.tokens.get(e.token);
        if (!t) return null;
        const down = (t.sheet?.hp ?? 1) <= 0 || t.health === 'down';
        const cls = ['turn', e.token === current && 'current', down && 'down'].filter(Boolean).join(' ');
        return (
          <button
            key={e.token}
            className={cls}
            style={{ background: t.color }}
            title={`${t.name}: initiative ${e.initiative}`}
            onClick={() => session.focus([t.x, t.y])}
          >
            {t.name.slice(0, 2)}
          </button>
        );
      })}
      {gm && (
        <button className="small" onClick={() => session.endCombat()}>
          End combat
        </button>
      )}
    </div>
  );
}

/** GM: the whole party takes a short or long rest. */
function RestButtons({ session }: Readonly<{ session: Session }>) {
  const party = () => [...session.tokens.values()].filter((t) => t.controllers.length > 0 && t.sheet).map((t) => t.id);
  return (
    <>
      <button className="small" title="Party takes a short rest" onClick={() => session.rest(party(), 'short')}>
        Short rest
      </button>
      <button className="small" title="Party takes a long rest" onClick={() => session.rest(party(), 'long')}>
        Long rest
      </button>
    </>
  );
}

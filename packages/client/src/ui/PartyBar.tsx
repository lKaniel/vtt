import { canObserve, isGm, isParty } from '@vtt/shared';
import type { Session } from '../session.ts';
import { EffectBadges, Face, HpBar } from './Portrait.tsx';

/** Portraits of your party down the left edge. Click to select, double-click to jump to them. */
export function PartyBar({ session }: Readonly<{ session: Session }>) {
  const you = session.you;
  // Players see the tokens they own or observe; the GM sees the whole party.
  const mine = [...session.tokens.values()].filter((t) =>
    you && isGm(you) ? isParty(t) : !!you && canObserve(t, you),
  );
  if (mine.length === 0) return null;
  const turn = session.turnToken()?.id;
  return (
    <nav className="party">
      {mine.map((t) => {
        const cls = ['member', session.selected === t.id && 'selected', turn === t.id && 'acting'];
        return (
          <button
            key={t.id}
            className={cls.filter(Boolean).join(' ')}
            title={`${t.name}: click to select, double-click to find`}
            onClick={() => session.select(t.id)}
            onDoubleClick={() => session.focus([t.x, t.y])}
          >
            <Face token={t} className="member-face" />
            <span className="member-info">
              <span className="member-name">{t.name}</span>
              <HpBar token={t} />
              <EffectBadges token={t} />
            </span>
          </button>
        );
      })}
    </nav>
  );
}

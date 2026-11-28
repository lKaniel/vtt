import { canObserve, isGm, isParty } from '@vtt/shared';
import type { Session } from '../session/session.ts';
import { cn } from '@/lib/utils';
import { EffectBadges, Face, HpBar } from './Portrait.tsx';
import { Pressable } from './kit/pressable.tsx';

/** Portraits of your party down the left edge. Click to select, double-click to jump to them. */
export function PartyBar({ session }: Readonly<{ session: Session }>) {
  const you = session.you;
  // Players see the tokens they own or observe; the GM sees the whole party.
  const mine = [...session.tokens.values()].filter((t) =>
    you && isGm(you) ? isParty(t) : !!you && canObserve(t, you),
  );
  if (mine.length === 0) return null;
  const turn = session.turns.current()?.id;
  return (
    <nav className="party phone:top-12 phone:left-2 phone:flex-row">
      {mine.map((t) => {
        const cls = ['member', session.selected === t.id && 'selected', turn === t.id && 'acting'];
        return (
          <Pressable
            key={t.id}
            className={cn(cls, 'phone:w-auto phone:p-1 phone:[&_.member-face]:h-10 phone:[&_.member-face]:w-9')}
            title={`${t.name}: click to select, double-click to find`}
            onClick={() => session.select(t.id)}
            onDoubleClick={() => session.focus([t.x, t.y])}
          >
            <Face token={t} className="member-face" />
            <span className="member-info phone:hidden">
              <span className="member-name">{t.name}</span>
              <HpBar token={t} />
              <EffectBadges token={t} at={{ now: session.time.now(), fighting: !!session.combat }} />
            </span>
          </Pressable>
        );
      })}
    </nav>
  );
}

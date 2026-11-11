import { gridKind, isParty, sameFloor } from '@vtt/shared';
import { type AdviceFighter, adviseTurn, currentTurn, type TokenView, type TurnAdvice } from '@vtt/system-dnd5e';
import type { Session } from '../session/session.ts';

// The GM's turn helper at the table (system-dnd5e turn-advice.ts): on a
// monster's turn in a fight, what it does best against the fight's creatures on
// its floor, and taking that in one click the way the GM would by hand:
// select it, target the foe and make the attack (walk-in-range.ts walks it
// up first when it must).

export interface Shown {
  mover: TokenView;
  target: TokenView;
  advice: TurnAdvice;
}

type AdviceHost = Pick<Session, 'combat' | 'tokens' | 'world' | 'isGm' | 'turns'>;

const fighterOf = (t: TokenView): AdviceFighter | undefined => (t.sheet ? { ...t, sheet: t.sheet } : undefined);

/** The creature taking its turn in a fight while it still has an attack to make, for the GM alone. */
function attacker(s: AdviceHost): string | undefined {
  const combat = s.combat;
  if (!combat || combat.peaceful || !s.isGm()) return undefined;
  return combat.left.action || combat.left.attacks > 0 ? currentTurn(combat) : undefined;
}

/** The monster taking its turn, on its feet, with its sheet. */
function monster(s: AdviceHost): { mover: TokenView; me: AdviceFighter } | undefined {
  const id = attacker(s);
  const mover = id ? s.tokens.get(id) : undefined;
  const me = mover && !isParty(mover) ? fighterOf(mover) : undefined;
  return mover && me && me.sheet.hp > 0 ? { mover, me } : undefined;
}

/** The fight's creatures the GM sees on the mover's floor. */
function fighters(s: AdviceHost, mover: TokenView): AdviceFighter[] {
  const fighting = new Set(s.combat?.order.map((e) => e.token));
  return [...s.tokens.values()]
    .filter((t) => fighting.has(t.id) && !t.hidden && sameFloor(s.world?.levels, mover, t))
    .flatMap((t) => fighterOf(t) ?? []);
}

/** What the monster whose turn it is does best; undefined for players, outside a fight, or when it can't reach a foe. */
export function turnAdvice(s: AdviceHost): Shown | undefined {
  const turn = monster(s);
  if (!turn) return undefined;
  const { mover, me } = turn;
  const walk = Math.min(s.turns.movementLeft(me.id), me.sheet.speed);
  const scene = { gridSize: s.world?.gridSize ?? 100, grid: gridKind(s.world ?? {}), walk };
  const advice = adviseTurn(me, fighters(s, mover), scene);
  const target = advice && s.tokens.get(advice.target);
  return advice && target ? { mover, target, advice } : undefined;
}

/** Takes the advice: the monster attacks its target, walking up first if it must. */
export function takeAdvice(s: Session, { mover, target, advice }: Shown): void {
  s.select(mover.id);
  s.targets.clear();
  s.targets.toggle(target.id);
  s.actions.arm(advice.attack);
}

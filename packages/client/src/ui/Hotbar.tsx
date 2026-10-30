import type { Attack, TokenView } from '@vtt/shared';
import type { Session } from '../session.ts';
import { SpellBar } from './SpellBar.tsx';

const SLOTS = 8;

/** BG3-style bar for the selected token: its health, what's left this turn, and its attacks. */
export function Hotbar({ session, onSheet }: Readonly<{ session: Session; onSheet: () => void }>) {
  const token = session.selected ? session.tokens.get(session.selected) : undefined;
  return (
    <footer className="hotbar">
      {token && (
        <>
          <div className="hotbar-who">
            <span className="dot" style={{ background: token.color }} />
            <strong>{token.name}</strong>
            {token.sheet && <Vitals token={token} />}
            <TurnBudget session={session} token={token} />
            {token.sheet && (
              <button className="small" onClick={onSheet} title="Character sheet (C)">
                Sheet
              </button>
            )}
          </div>
          <SpellBar session={session} token={token} />
          <div className="hotbar-slots">
            {Array.from({ length: SLOTS }, (_, i) => (
              <AttackSlot key={i} session={session} attack={token.sheet?.attacks[i]} hotkey={i + 1} />
            ))}
            {session.isMyTurn() && session.turnToken()?.id === token.id && (
              <button className="end-turn" onClick={() => session.endTurn()} title="End turn (Space)">
                End turn
              </button>
            )}
          </div>
        </>
      )}
      <div className="hint">{hint(session, token)}</div>
    </footer>
  );
}

function hint(session: Session, token: TokenView | undefined): string {
  if (session.armed) return `Click a target for ${session.armed} · Esc or click the ground to cancel`;
  const aiming = session.aiming;
  if (aiming?.mode === 'point') return `Click where ${aiming.spell.name} goes · Esc to cancel`;
  if (aiming)
    return `Click ${aiming.need - aiming.picks.length} more target(s) for ${aiming.spell.name} · Esc to cancel`;
  if (!token) return 'Click one of your tokens to select it · Drag to pan · Wheel to zoom';
  return 'Click the ground to walk · 1-8 to attack · Esc to deselect · Drag to pan · Wheel to zoom';
}

function Vitals({ token }: Readonly<{ token: TokenView }>) {
  const sheet = token.sheet!;
  return (
    <span className="vitals">
      <span className="hp" title="Hit points">
        ♥ {sheet.hp}/{sheet.maxHp}
      </span>
      <span title="Armor class">🛡 {sheet.ac}</span>
    </span>
  );
}

/** Movement and action left, shown while it's this token's turn. */
function TurnBudget({ session, token }: Readonly<{ session: Session; token: TokenView }>) {
  const combat = session.combat;
  if (!combat || session.turnToken()?.id !== token.id) return null;
  return (
    <span className="budget">
      <span title="Movement left">{combat.left.move} ft</span>
      <span className={combat.left.action ? 'pip on' : 'pip'} title="Action" />
      <span className={combat.left.bonus ? 'pip bonus on' : 'pip bonus'} title="Bonus action" />
    </span>
  );
}

function AttackSlot({ session, attack, hotkey }: Readonly<{ session: Session; attack?: Attack; hotkey: number }>) {
  if (!attack) return <div className="slot" />;
  const armed = session.armed === attack.name;
  return (
    <button
      className={armed ? 'slot attack armed' : 'slot attack'}
      title={describeAttack(attack)}
      onClick={() => session.arm(armed ? undefined : attack.name)}
    >
      <span className="slot-key">{hotkey}</span>
      <span className="slot-icon">{attack.kind === 'melee' ? '⚔' : '➶'}</span>
      <span className="slot-name">{attack.name}</span>
    </button>
  );
}

export function describeAttack(a: Attack): string {
  const reach = a.kind === 'melee' ? `reach ${a.reach ?? 5} ft` : `range ${a.range?.join('/')} ft`;
  const damage = a.damage.map((d) => `${d.dice} ${d.type}`).join(' + ');
  return `${a.name}: ${a.toHit >= 0 ? '+' : ''}${a.toHit} to hit, ${reach}, ${damage}`;
}

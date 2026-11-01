import { isGm, type Role, RoleSchema } from '@vtt/shared';
import type { Session } from '../session.ts';

/** How each role reads on screen, and what it lets a seat do. */
export const ROLE_NAMES: Record<Role, { name: string; about: string }> = {
  gm: { name: 'Game master', about: 'Runs the table: sees and edits everything.' },
  trusted: { name: 'Trusted player', about: 'Plays and edits the sheets of the tokens they own.' },
  player: { name: 'Player', about: 'Plays the tokens they own.' },
  observer: { name: 'Observer', about: "Watches through the party's eyes; acts on nothing." },
};

/**
 * GM: everyone at the table and what they may do. Changes take effect at
 * once; who owns which token is set on its sheet (Details, Ownership).
 */
export function PlayersTab({ session }: Readonly<{ session: Session }>) {
  const gms = session.players.filter(isGm).length;
  return (
    <div className="players-tab">
      <ul className="rows">
        {session.players.map((p) => {
          const lastGm = isGm(p) && gms === 1;
          return (
            <li key={p.id} className="row player-row">
              <span className="player-dot" style={{ background: p.color }} />
              <span className="row-name">
                {p.name}
                {p.id === session.you?.id && <span className="muted"> (you)</span>}
              </span>
              <select
                value={p.role}
                aria-label={`${p.name}'s role`}
                disabled={lastGm}
                title={lastGm ? 'The table needs a GM' : ROLE_NAMES[p.role].about}
                onChange={(e) => session.setRole(p.id, e.target.value as Role)}
              >
                {RoleSchema.options.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_NAMES[r].name}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
      <dl className="role-help muted">
        {RoleSchema.options.map((r) => (
          <div key={r}>
            <dt>{ROLE_NAMES[r].name}</dt>
            <dd>{ROLE_NAMES[r].about}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">Set who owns or observes a creature on its sheet: Edit, then Details.</p>
    </div>
  );
}

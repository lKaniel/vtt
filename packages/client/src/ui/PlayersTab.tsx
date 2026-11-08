import { isGm, type Role, RoleSchema } from '@vtt/shared';
import { t } from '../i18n/index.ts';
import type { Session } from '../session/session.ts';
import { AddPlayerForm } from './GameAccess.tsx';
import { CopyInvite, InviteBox } from './InviteLinks.tsx';
import { PlaysPick } from './PlaysPick.tsx';
import { ROLE_NAMES } from './role-names.ts';
import { SelectField } from './kit/select.tsx';

/**
 * GM: everyone at the table and what they may do. Changes take effect at
 * once; who owns which token is set on its sheet (Details, Ownership).
 */
export function PlayersTab({ session }: Readonly<{ session: Session }>) {
  const gms = session.players.filter(isGm).length;
  const invite = session.isGm() ? session.gameId : undefined;
  return (
    <div className="players-tab">
      {invite && <InviteBox game={invite} />}
      <ul className="rows">
        {session.players.map((p) => {
          const lastGm = isGm(p) && gms === 1;
          return (
            <li key={p.id} className="row player-row flex-wrap">
              <span className="player-dot" style={{ background: p.color }} />
              <span className="row-name">
                {p.name}
                {p.id === session.you?.id && <span className="muted"> (you)</span>}
              </span>
              {invite && p.id !== session.you?.id && <CopyInvite game={invite} player={p} />}
              <SelectField
                value={p.role}
                aria-label={`${p.name}'s role`}
                disabled={lastGm}
                title={lastGm ? 'The table needs a GM' : ROLE_NAMES[p.role].about}
                onValueChange={(r) => session.requests.setRole(p.id, r as Role)}
                options={RoleSchema.options.map((r) => ({ value: r, label: ROLE_NAMES[r].name }))}
              />
              {!isGm(p) && (
                <div className="flex basis-full items-center gap-2 pl-5 text-xs text-muted-foreground">
                  {t('players.character')}
                  <PlaysPick session={session} player={p} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {invite && (
        <div className="flex flex-col gap-1" data-slot="players-add">
          <span className="muted">{t('players.addHint')}</span>
          <AddPlayerForm game={invite} players={session.players} onAdded={() => undefined} />
        </div>
      )}
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

import type { ChatMessage, CheckLog } from '@vtt/system-dnd5e';
import type { Session } from '../session.ts';
import { Badge } from './kit/badge.tsx';
import { Button } from './kit/button.tsx';

// A check card in chat: each creature asked, with its total once rolled or
// a Roll button for the creatures you control, and how a group check or a
// contest came out.

export function CheckLine({ m, session }: Readonly<{ m: ChatMessage & { check: CheckLog }; session: Session }>) {
  const { check } = m;
  return (
    <span className="flex flex-col gap-0.5">
      {check.entries.map((e) => {
        const token = session.tokens.get(e.token);
        const mine = token && session.canControl(token);
        return (
          <span key={e.token} className="flex items-center gap-2">
            <span className="flex-1">{e.name}</span>
            {e.total !== undefined && <strong className="roll-total">{e.total}</strong>}
            {e.success !== undefined && (
              <Badge variant={e.success ? 'good' : 'warn'}>{e.success ? 'success' : 'failure'}</Badge>
            )}
            {e.total === undefined && mine && (
              <Button variant="outline" size="sm" onClick={() => session.rollCheck(e.token, check, m.id)}>
                Roll
              </Button>
            )}
            {e.total === undefined && !mine && <span className="muted text-xs">waiting</span>}
          </span>
        );
      })}
      {check.outcome && <strong className="text-gold">{check.outcome}</strong>}
    </span>
  );
}

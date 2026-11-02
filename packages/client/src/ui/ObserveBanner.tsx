import type { Session } from '../session.ts';
import { Button } from './kit/button.tsx';

/** GM: whose eyes the map shows (see session-hud.ts), with a way back. */
export function ObserveBanner({ session }: Readonly<{ session: Session }>) {
  const token = session.observing ? session.tokens.get(session.observing) : undefined;
  if (!token) return null;
  return (
    <div
      data-slot="observe-banner"
      role="status"
      className="fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 px-4 py-1.5 text-sm text-gold-bright art-panel"
    >
      Seeing through {token.name}’s eyes
      <Button size="sm" variant="ghost" onClick={() => session.observe(undefined)}>
        Stop
      </Button>
    </div>
  );
}

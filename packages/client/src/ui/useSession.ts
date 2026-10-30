import { useSyncExternalStore } from 'react';
import type { Session } from '../session.ts';

/** Re-renders the component whenever the session changes. */
export function useSession(session: Session): Session {
  useSyncExternalStore(
    (cb) => session.on('change', cb),
    () => session.version,
  );
  return session;
}

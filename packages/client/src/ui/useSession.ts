import { useLanguage } from '../i18n/index.ts';
import { useSyncExternalStore } from 'react';
import type { Session } from '../session/session.ts';

/** Re-renders the component whenever the session changes. */
export function useSession(session: Session): Session {
  useSyncExternalStore(
    (cb) => session.on('change', cb),
    () => session.version,
  );
  // A new language redraws whatever shows the session.
  useLanguage();
  return session;
}

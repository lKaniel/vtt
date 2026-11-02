import type { Character } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { api, ApiError } from '../../account-api.ts';

/** Saving a roster character: busy while it goes, the server's reasons when it refuses. */
export function useSaveCharacter(onDone: () => void): {
  busy: boolean;
  error?: string;
  save: (c: Character) => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const save = (c: Character) => {
    setBusy(true);
    api.saveCharacter(c).then(onDone, (e: unknown) => {
      setError(e instanceof ApiError && e.issues.length ? e.issues.join(' ') : (e as Error).message);
      setBusy(false);
    });
  };
  return { busy, error, save };
}

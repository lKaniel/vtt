import type { Character } from '@vtt/system-dnd5e';
import { useState } from 'react';
import { api, ApiError } from '../../server-api.ts';

/** Saving a character at `game`: busy while it goes, the server's reasons when it refuses. */
export function useSaveCharacter(
  game: string,
  onDone: (saved: Character) => void,
): {
  busy: boolean;
  error?: string;
  save: (c: Character) => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const save = (c: Character) => {
    setBusy(true);
    api.saveCharacter(game, c).then(onDone, (e: unknown) => {
      setError(e instanceof ApiError && e.issues.length ? e.issues.join(' ') : (e as Error).message);
      setBusy(false);
    });
  };
  return { busy, error, save };
}

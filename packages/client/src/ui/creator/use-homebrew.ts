import type { Class } from '@vtt/system-dnd5e';
import { useEffect, useState } from 'react';
import { api } from '../../server-api.ts';

/** The GM's homebrew classes you may build with at `game` (none until they arrive, or if asking fails). */
export function useHomebrewClasses(game: string): readonly Class[] {
  const [classes, setClasses] = useState<readonly Class[]>([]);
  useEffect(() => {
    let live = true;
    api.homebrew(game).then(
      (list) => live && setClasses(list),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [game]);
  return classes;
}

/** The book's classes, then the homebrew ones the character doesn't carry yet. */
export function classesToPick(have: Iterable<Class>, homebrew: readonly Class[]): Class[] {
  const list = [...have];
  return [...list, ...homebrew.filter((h) => !list.some((k) => k.id === h.id))];
}

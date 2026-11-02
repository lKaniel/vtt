import type { Class } from '@vtt/system-dnd5e';
import { useEffect, useState } from 'react';
import { api } from '../../account-api.ts';

/** The GMs' homebrew classes this account may build with (none until they arrive, or if asking fails). */
export function useHomebrewClasses(): readonly Class[] {
  const [classes, setClasses] = useState<readonly Class[]>([]);
  useEffect(() => {
    let live = true;
    api.homebrew().then(
      (list) => live && setClasses(list),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  return classes;
}

/** The book's classes, then the homebrew ones the character doesn't carry yet. */
export function classesToPick(have: Iterable<Class>, homebrew: readonly Class[]): Class[] {
  const list = [...have];
  return [...list, ...homebrew.filter((h) => !list.some((k) => k.id === h.id))];
}

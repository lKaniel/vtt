import { useEffect, useRef, useState } from 'react';

const DELAY_MS = 450;

/**
 * Editing that saves itself: changes go into a local draft at once and are
 * sent shortly after the last keystroke (or at once for clicks). The draft
 * gives way to the server's copy as soon as that arrives with nothing
 * waiting to be sent.
 */
export function useAutoSave<T>(live: T, save: (draft: T) => void) {
  const [draft, setDraft] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<T | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const flush = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (pending.current) saveRef.current(pending.current);
    pending.current = null;
  };

  useEffect(() => {
    if (timer.current === undefined) setDraft(null);
  }, [live]);
  useEffect(() => flush, []);

  const update = (fn: (d: T) => T, now = false) => {
    const next = fn(pending.current ?? draft ?? live);
    pending.current = next;
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, now ? 0 : DELAY_MS);
  };
  return { value: draft ?? live, update };
}

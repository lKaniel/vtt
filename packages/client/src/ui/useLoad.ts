import { useCallback, useEffect, useState } from 'react';

/** Loads something for a screen, with the error to show and a way to load it again. */
export function useLoad<T>(load: () => Promise<T>): { data?: T; error?: string; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const reload = useCallback(() => {
    load().then(
      (d) => {
        setData(d);
        setError(undefined);
      },
      (e: unknown) => setError((e as Error).message),
    );
  }, [load]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}

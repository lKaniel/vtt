// A player's options for this browser only (how much animation to show,
// later 3D dice): nothing the table needs to know. Storage can be missing or
// refuse (private windows), so every read has a fallback.

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

const PREFIX = 'vtt:';

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** The stored value if it is one of `allowed`, else `fallback`. */
export function readPref<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
  storage: Storage | undefined = browserStorage(),
): T {
  try {
    const value = storage?.getItem(PREFIX + key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string, storage: Storage | undefined = browserStorage()): void {
  try {
    storage?.setItem(PREFIX + key, value);
  } catch {
    // Not kept: the option still holds until the page reloads.
  }
}

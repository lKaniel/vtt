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

/** A stored list of strings (folders closed in a list), or none. */
export function readListPref(key: string, storage: Storage | undefined = browserStorage()): string[] {
  const value = readJsonPref(key, storage);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** A stored JSON value (where a window was left), unchecked; undefined when there is none or it doesn't parse. */
export function readJsonPref(key: string, storage: Storage | undefined = browserStorage()): unknown {
  try {
    const raw = storage?.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

export function writeListPref(
  key: string,
  values: readonly string[],
  storage: Storage | undefined = browserStorage(),
): void {
  writePref(key, JSON.stringify(values), storage);
}

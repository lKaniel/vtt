import { useSyncExternalStore } from 'react';
import { EN, type MessageKey } from './en.ts';
import { I18n } from './i18n.ts';

// The page's translations: `t` for the table's own words (typed keys),
// `i18n` for plugins and the language picker, `useLanguage` to redraw a
// screen when the language changes.

export const i18n = new I18n(EN);

export type { MessageKey };

export function t(key: MessageKey, vars?: Readonly<Record<string, string | number>>): string {
  return i18n.t(key, vars);
}

/** Redraws the calling component (and so the screen under it) when the language changes. */
export function useLanguage(): string {
  useSyncExternalStore(
    (fn) => i18n.subscribe(fn),
    () => i18n.version,
  );
  return i18n.lang;
}
